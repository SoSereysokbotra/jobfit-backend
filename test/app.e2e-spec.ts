import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// Namespace import, not a default import: this project's tsconfig has esModuleInterop off,
// so `import request from 'supertest'` compiles but is undefined at runtime.
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    it('/ (GET)', () => {
        return request(app.getHttpServer())
            .get('/')
            .expect(200)
            .expect('Hello World!');
    });

    afterEach(async () => {
        await app.close();
    });
});
