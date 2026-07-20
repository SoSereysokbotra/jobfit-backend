import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

import { ConfigType } from '@nestjs/config';

import aiConfig from '@config/ai.config';

import { AiClient } from './ai.client';
import { AiServiceError } from './ai.errors';

/**
 * Records each inbound request and lets a test decide the response. Runs a real
 * loopback HTTP server so the client's global `fetch`, timeout, retry and error
 * mapping are all exercised for real — no HTTP mocking library needed.
 */
type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  hit: number,
) => void | Promise<void>;

interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

describe('AiClient', () => {
  let server: Server;
  let baseUrl: string;
  let handler: Handler;
  let requests: RecordedRequest[];

  const buildClient = (
    overrides: Partial<ConfigType<typeof aiConfig>> = {},
  ): AiClient =>
    new AiClient({
      serviceUrl: baseUrl,
      serviceKey: 'test-secret',
      timeoutMsGenerate: 1000,
      timeoutMsEmbed: 1000,
      ...overrides,
    });

  beforeAll((done) => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const hit = requests.length;
        requests.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body,
        });
        void handler(req, res, hit);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      // Base URL includes the /api/v1 prefix, like the real config.
      baseUrl = `http://127.0.0.1:${port}/api/v1`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    requests = [];
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    };
  });

  const json = (res: ServerResponse, status: number, obj: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  it('parses a resume and sends key + JSON body to the right path', async () => {
    const parsed = {
      fullName: 'Jane Doe',
      email: 'jane@x.com',
      phone: null,
      location: null,
      summary: null,
      skills: ['NestJS'],
      experiences: [],
      educations: [],
    };
    handler = (_req, res) => json(res, 200, parsed);

    const result = await buildClient().parseResume('resume text', 'PDF');

    expect(result).toEqual(parsed);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/resume/parse');
    expect(requests[0].headers['x-ai-service-key']).toBe('test-secret');
    expect(JSON.parse(requests[0].body)).toEqual({
      text: 'resume text',
      fileType: 'PDF',
    });
  });

  it('calls GET /health with no body', async () => {
    handler = (_req, res) =>
      json(res, 200, { status: 'ok', modelsLoaded: ['qwen3', 'bge-m3'] });

    const result = await buildClient().health();

    expect(result).toEqual({ status: 'ok', modelsLoaded: ['qwen3', 'bge-m3'] });
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('/api/v1/health');
    expect(requests[0].body).toBe('');
  });

  it('maps a 401 to an UNAUTHORIZED AiServiceError and does NOT retry', async () => {
    handler = (_req, res) =>
      json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'bad key' } });

    await expect(buildClient().embed(['x'])).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'bad key',
    } as Partial<AiServiceError>);
    expect(requests).toHaveLength(1); // 4xx not retried
  });

  it('maps a 400 to BAD_REQUEST from the error envelope', async () => {
    handler = (_req, res) =>
      json(res, 400, { error: { code: 'BAD_REQUEST', message: 'text required' } });

    const err = await buildClient()
      .scoreResume('')
      .catch((e) => e);
    expect(err).toBeInstanceOf(AiServiceError);
    expect(err.code).toBe('BAD_REQUEST');
    expect(requests).toHaveLength(1);
  });

  it('retries once on 5xx then succeeds', async () => {
    handler = (_req, res, hit) => {
      if (hit === 0) return json(res, 503, { error: { code: 'MODEL_ERROR', message: 'down' } });
      return json(res, 200, { model: 'bge-m3', dim: 1024, embeddings: [[0.1]] });
    };

    const result = await buildClient().embed(['x']);

    expect(result.dim).toBe(1024);
    expect(requests).toHaveLength(2); // one retry
  });

  it('retries once on 5xx then gives up with the mapped error', async () => {
    handler = (_req, res) =>
      json(res, 500, { error: { code: 'MODEL_ERROR', message: 'boom' } });

    await expect(buildClient().embed(['x'])).rejects.toMatchObject({
      code: 'MODEL_ERROR',
      status: 500,
    });
    expect(requests).toHaveLength(2); // original + 1 retry
  });

  it('times out slow responses and reports code TIMEOUT (after a retry)', async () => {
    handler = (_req, res) => {
      // Never respond within the timeout window.
      setTimeout(() => json(res, 200, {}), 500);
    };

    const err = await buildClient({ timeoutMsEmbed: 40 })
      .embed(['x'])
      .catch((e) => e);

    expect(err).toBeInstanceOf(AiServiceError);
    expect(err.code).toBe('TIMEOUT');
    expect(requests.length).toBe(2); // timed-out attempts are retried once
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    handler = (_req, res) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    };

    const err = await buildClient()
      .parseResume('x', 'PDF')
      .catch((e) => e);
    expect(err.code).toBe('MODEL_ERROR'); // 5xx default
    expect(err.status).toBe(502);
    expect(err.message).toContain('502');
  });
});
