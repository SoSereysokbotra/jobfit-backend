import type { IncomingMessage, ServerResponse } from 'http';
import { buildLoggerParams } from './logger.config';
import { REDACTED } from '../common/logging/redaction';

// Reach into the pinoHttp options the app actually uses.
function opts(format: 'json' | 'pretty' = 'json') {
  const params = buildLoggerParams('production', 'info', format);
  return params.pinoHttp as Record<string, any>;
}

describe('buildLoggerParams', () => {
  it('redacts secrets in the log hook BEFORE the sink (formatters.log)', () => {
    const log = opts().formatters.log as (o: any) => any;
    const out = log({
      message: 'login',
      password: 'Password123',
      req: { headers: { authorization: 'Bearer abc.def' } },
    });
    expect(out.password).toBe(REDACTED);
    expect(out.req.headers.authorization).toBe(REDACTED);
    expect(out.message).toBe('login');
  });

  it('maps pino level -> GCP severity in JSON mode', () => {
    const level = opts('json').formatters.level as (l: string) => any;
    expect(level('error')).toEqual({ severity: 'ERROR' });
    expect(level('warn')).toEqual({ severity: 'WARNING' });
    expect(level('info')).toEqual({ severity: 'INFO' });
  });

  it('uses `message` as the message key and pretty transport only in pretty mode', () => {
    expect(opts('json').messageKey).toBe('message');
    expect(opts('json').transport).toBeUndefined();
    expect(opts('pretty').transport).toMatchObject({ target: 'pino-pretty' });
    // No GCP severity remap in pretty mode (keep numeric level for colourising).
    expect(opts('pretty').formatters.level).toBeUndefined();
  });

  it('genReqId reuses an inbound x-request-id and echoes it on the response', () => {
    const setHeader = jest.fn();
    const req = { headers: { 'x-request-id': 'incoming-123' } } as unknown as IncomingMessage;
    const res = { setHeader } as unknown as ServerResponse;
    const id = (opts().genReqId as (a: any, b: any) => string)(req, res);
    expect(id).toBe('incoming-123');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'incoming-123');
  });

  it('genReqId generates an id when none is supplied', () => {
    const setHeader = jest.fn();
    const req = { headers: {} } as unknown as IncomingMessage;
    const res = { setHeader } as unknown as ServerResponse;
    const id = (opts().genReqId as (a: any, b: any) => string)(req, res);
    expect(id).toMatch(/[0-9a-f-]{36}/);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', id);
  });

  it('silences logs in the test environment', () => {
    const params = buildLoggerParams('test', 'info', 'json');
    expect((params.pinoHttp as Record<string, any>).level).toBe('silent');
  });
});
