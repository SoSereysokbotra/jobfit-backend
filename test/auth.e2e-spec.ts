// test/auth.e2e-spec.ts
//
// End-to-end auth flows against the real DB (Supabase). Redis is not required — lockout
// and blacklist fail open, and refresh-token theft detection is DB-backed (revokedAt).
// Verification/reset codes are delivered via an email stub, so the test reads them from
// the DB (where they're stored) to drive the flows.

import 'dotenv/config';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request, { Response as SupertestResponse } from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

jest.setTimeout(60000);

/** Pull `refresh_token=<value>` (name=value only) from a response's Set-Cookie. */
function refreshCookie(res: SupertestResponse): string | undefined {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    const rt = set?.find((c) => c.startsWith('refresh_token='));
    return rt ? rt.split(';')[0] : undefined;
}

describe('Auth flows (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaClient;
    let server: import('http').Server;
    const createdEmails: string[] = [];

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication();
        app.use(cookieParser());
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        await app.init();
        server = app.getHttpServer();
        prisma = new PrismaClient();
    });

    afterAll(async () => {
        if (createdEmails.length) {
            await prisma.user
                .deleteMany({ where: { email: { in: createdEmails } } })
                .catch(() => undefined);
        }
        await prisma.$disconnect();
        await app.close();
    });

    const uniqueEmail = (tag: string): string => {
        const email = `e2e_${tag}_${Date.now()}@example.com`.toLowerCase();
        createdEmails.push(email);
        return email;
    };
    const verificationCode = async (email: string) =>
        (await prisma.user.findUnique({ where: { email } }))?.verificationCode;
    const resetCode = async (email: string) =>
        (await prisma.user.findUnique({ where: { email } }))?.passwordResetCode;

    it('Flow: register -> verify-email -> login -> refresh-token -> logout', async () => {
        const email = uniqueEmail('flow1');
        const password = 'Str0ngPass1';
        const agent = request.agent(server);

        await agent
            .post('/auth/register')
            .send({ email, password, name: 'Flow One' })
            .expect(201);

        const code = await verificationCode(email);
        expect(code).toMatch(/^\d{6}$/);

        await agent.post('/auth/verify-email').send({ code }).expect(200);
        expect(
            (await prisma.user.findUnique({ where: { email } }))?.emailVerified,
        ).toBe(true);

        const login = await agent
            .post('/auth/login')
            .send({ email, password })
            .expect(200);
        expect(typeof login.body.accessToken).toBe('string');
        expect(login.body.refreshToken).toBeUndefined(); // refresh token only in cookie

        const refreshed = await agent.post('/auth/refresh-token').expect(200);
        expect(typeof refreshed.body.accessToken).toBe('string');

        await agent
            .post('/auth/logout')
            .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
            .expect(200);

        // Cookie cleared + token deleted => refreshing after logout fails.
        await agent.post('/auth/refresh-token').expect(401);
    });

    it('Flow: password reset revokes all existing refresh tokens', async () => {
        const email = uniqueEmail('flow2');
        const password = 'Str0ngPass1';
        const newPassword = 'N3wStr0ngPass';
        const agent = request.agent(server);

        await agent
            .post('/auth/register')
            .send({ email, password, name: 'Flow Two' })
            .expect(201);
        await agent
            .post('/auth/verify-email')
            .send({ code: await verificationCode(email) })
            .expect(200);
        await agent.post('/auth/login').send({ email, password }).expect(200);

        // 3-step reset.
        await agent.post('/auth/request-password-reset').send({ email }).expect(200);
        const code = await resetCode(email);
        expect(code).toMatch(/^\d{6}$/);
        await agent.post('/auth/verify-password-reset').send({ code }).expect(200);
        await agent
            .post('/auth/reset-password')
            .send({ password: newPassword })
            .expect(200);

        // The pre-reset refresh token (still in the agent jar) is now rejected.
        await agent.post('/auth/refresh-token').expect(401);

        // New password works; old one does not.
        const relogin = await agent
            .post('/auth/login')
            .send({ email, password: newPassword })
            .expect(200);
        expect(typeof relogin.body.accessToken).toBe('string');
        await agent.post('/auth/login').send({ email, password }).expect(401);
    });

    it('Flow: refresh-token reuse => 401 to client, security-alert log, all sessions dead', async () => {
        const email = uniqueEmail('flow3');
        const password = 'Str0ngPass1';
        const agent = request.agent(server);

        await agent
            .post('/auth/register')
            .send({ email, password, name: 'Flow Three' })
            .expect(201);
        await agent
            .post('/auth/verify-email')
            .send({ code: await verificationCode(email) })
            .expect(200);
        const login = await agent
            .post('/auth/login')
            .send({ email, password })
            .expect(200);

        const originalCookie = refreshCookie(login);
        expect(originalCookie).toBeTruthy();

        // Rotate once with the original token (raw request so we control the cookie).
        const rotated = await request(server)
            .post('/auth/refresh-token')
            .set('Cookie', originalCookie!)
            .expect(200);
        const rotatedCookie = refreshCookie(rotated);
        expect(rotatedCookie).toBeTruthy();

        // Replaying the ORIGINAL (now-spent) token => reuse.
        const securitySpy = jest.spyOn(Logger.prototype, 'error');
        const replay = await request(server)
            .post('/auth/refresh-token')
            .set('Cookie', originalCookie!)
            .expect(401);

        // Client sees a generic invalid-token response (NOT "reuse") — no extra info leaked.
        expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');

        // Server-side: a distinct security-alert log line fired.
        const alerted = securitySpy.mock.calls.some((args) =>
            /SECURITY ALERT.*reuse/i.test(String(args[0])),
        );
        expect(alerted).toBe(true);
        securitySpy.mockRestore();

        // All sessions dead: even the freshly-rotated token is now rejected.
        await request(server)
            .post('/auth/refresh-token')
            .set('Cookie', rotatedCookie!)
            .expect(401);

        // Recovery requires a fresh login.
        const relogin = await agent
            .post('/auth/login')
            .send({ email, password })
            .expect(200);
        expect(typeof relogin.body.accessToken).toBe('string');
    });
});
