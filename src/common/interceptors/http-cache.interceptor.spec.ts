// HTTP caching tests (PWA offline, Phase 5).
//
// These boot a REAL (tiny) Nest app over supertest rather than asserting on a mocked
// ExecutionContext, because the two things most likely to go wrong here are only
// observable over real HTTP:
//
//   1. Whether a 304 actually carries no body. The interceptor returns EMPTY, and the
//      globally-registered TransformInterceptor sits OUTSIDE it — if that envelope still
//      fired, every 304 would ship a body, which is invalid and defeats the point.
//   2. Whether the ETag survives that same envelope. TransformInterceptor injects a fresh
//      `timestamp` on every response, so an ETag hashed from the enveloped body would
//      change every request and never match.

import { Controller, Get, INestApplication, UseInterceptors } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// require, not a default import: this tsconfig has esModuleInterop off, so `import request
// from 'supertest'` compiles but is undefined at runtime.
import * as request from 'supertest';

import { HttpCache } from '../decorators/http-cache.decorator';
import { HttpCacheInterceptor } from './http-cache.interceptor';
import { TransformInterceptor } from './transform.interceptor';

/** Mutable fixtures so a test can "update the resource" between requests. */
const state = {
  job: {
    id: 'job-1',
    title: 'Engineer',
    updatedAt: new Date('2026-08-10T09:00:00.000Z'),
  },
  list: [{ id: 'a', name: 'first' }],
};

@Controller('t')
class TestController {
  @Get('job')
  @UseInterceptors(HttpCacheInterceptor)
  @HttpCache({ maxAge: 300, staleWhileRevalidate: 600 })
  job() {
    return state.job;
  }

  @Get('list')
  @UseInterceptors(HttpCacheInterceptor)
  @HttpCache({ maxAge: 60, scope: 'private' })
  list() {
    return state.list;
  }

  @Get('uncached')
  uncached() {
    return { hello: 'world' };
  }
}

describe('HttpCacheInterceptor (over real HTTP)', () => {
  let app: INestApplication;
  let server: import('http').Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts: the response envelope is global and wraps everything.
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    state.job = {
      id: 'job-1',
      title: 'Engineer',
      updatedAt: new Date('2026-08-10T09:00:00.000Z'),
    };
    state.list = [{ id: 'a', name: 'first' }];
  });

  it('first request returns 200 with an ETag and Cache-Control', async () => {
    const res = await request(server).get('/t/job').expect(200);

    expect(res.headers.etag).toBeDefined();
    expect(res.headers['cache-control']).toBe(
      'public, max-age=300, stale-while-revalidate=600',
    );
    expect(res.headers.vary).toBe('Authorization');
    // The envelope is still applied on a 200.
    expect(res.body).toMatchObject({ success: true, data: { id: 'job-1' } });
  });

  it('second request with a matching If-None-Match returns 304 with NO body', async () => {
    const first = await request(server).get('/t/job').expect(200);
    const etag = first.headers.etag;

    const second = await request(server)
      .get('/t/job')
      .set('If-None-Match', etag)
      .expect(304);

    // The assertion this whole file exists for.
    expect(second.text).toBeFalsy();
    expect(second.body).toEqual({});
  });

  it('returns 200 and a NEW ETag once the resource is updated', async () => {
    const first = await request(server).get('/t/job').expect(200);
    const original = first.headers.etag;

    // Someone edits the job — updatedAt moves.
    state.job = {
      id: 'job-1',
      title: 'Staff Engineer',
      updatedAt: new Date('2026-08-10T11:00:00.000Z'),
    };

    const second = await request(server)
      .get('/t/job')
      .set('If-None-Match', original)
      .expect(200);

    expect(second.headers.etag).toBeDefined();
    expect(second.headers.etag).not.toBe(original);
    expect(second.body.data.title).toBe('Staff Engineer');
  });

  it('keeps the ETag stable across requests despite the envelope’s changing timestamp', async () => {
    const a = await request(server).get('/t/job').expect(200);
    const b = await request(server).get('/t/job').expect(200);

    // The envelope timestamp differs...
    expect(a.body.timestamp).toBeDefined();
    // ...but the validator does not, because it is computed before the envelope.
    expect(b.headers.etag).toBe(a.headers.etag);
  });

  it('uses a weak validator for a record with updatedAt', async () => {
    const res = await request(server).get('/t/job').expect(200);
    // W/ — the tag promises "same version", not "same bytes".
    expect(res.headers.etag).toMatch(/^W\//);
  });

  it('uses a strong content hash for a list, and revalidates it', async () => {
    const first = await request(server).get('/t/list').expect(200);
    expect(first.headers.etag).not.toMatch(/^W\//);
    expect(first.headers['cache-control']).toBe('private, max-age=60');

    await request(server)
      .get('/t/list')
      .set('If-None-Match', first.headers.etag)
      .expect(304);

    state.list = [{ id: 'a', name: 'CHANGED' }];

    const third = await request(server)
      .get('/t/list')
      .set('If-None-Match', first.headers.etag)
      .expect(200);
    expect(third.headers.etag).not.toBe(first.headers.etag);
  });

  it('matches a weak tag sent back without its W/ prefix', async () => {
    // Proxies and clients rewrite these; a raw string compare would silently miss.
    const first = await request(server).get('/t/job').expect(200);
    const stripped = first.headers.etag.replace(/^W\//, '');

    await request(server).get('/t/job').set('If-None-Match', stripped).expect(304);
  });

  it('honours a list of candidate tags and the * wildcard', async () => {
    const first = await request(server).get('/t/job').expect(200);

    await request(server)
      .get('/t/job')
      .set('If-None-Match', `"nonsense", ${first.headers.etag}`)
      .expect(304);

    await request(server).get('/t/job').set('If-None-Match', '*').expect(304);
  });

  it('does not 304 when the tag does not match', async () => {
    await request(server)
      .get('/t/job')
      .set('If-None-Match', '"some-other-tag"')
      .expect(200);
  });

  it('leaves routes without @HttpCache without a Cache-Control policy', async () => {
    const res = await request(server).get('/t/uncached').expect(200);

    expect(res.headers['cache-control']).toBeUndefined();
    expect(res.headers.vary).toBeUndefined();
  });

  it('overrides Express’s own default ETag rather than being overwritten by it', async () => {
    // Express generates an ETag for every JSON response (a hash of the FINAL body,
    // envelope timestamp included, so it would change on every request and never match).
    // It only sets one when none is present, so the validator computed here must survive.
    const uncached = await request(server).get('/t/uncached').expect(200);
    expect(uncached.headers.etag).toBeDefined(); // Express's own

    const a = await request(server).get('/t/job').expect(200);
    const b = await request(server).get('/t/job').expect(200);
    expect(a.headers.etag).toBe(b.headers.etag); // ours, and stable

    // Express's default really is unstable across requests — the reason we set our own.
    const uncached2 = await request(server).get('/t/uncached').expect(200);
    expect(uncached2.headers.etag).not.toBe(uncached.headers.etag);
  });
});
