import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { REPORTED_ERROR_TYPE } from '../logging/error-reporting';

function makeHost(request: Record<string, unknown>) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

const config = {
  get: (key: string, def?: string) =>
    key === 'app.serviceName'
      ? 'jobfit-backend'
      : key === 'app.serviceVersion'
        ? 'test-rev'
        : def,
} as unknown as ConfigService;

describe('AllExceptionsFilter', () => {
  let logger: { error: jest.Mock; warn: jest.Mock };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = { error: jest.fn(), warn: jest.fn() };
    filter = new AllExceptionsFilter(logger as unknown as PinoLogger, config);
  });

  it('logs a 5xx as a GCP ReportedErrorEvent and returns a generic client message', () => {
    const { host, status, json } = makeHost({
      method: 'GET',
      url: '/api/v1/boom',
      headers: { 'user-agent': 'curl/8' },
      ip: '203.0.113.5',
      user: { id: 'user-1' },
    });

    filter.catch(new Error('DB connection exploded'), host);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [payload, message] = logger.error.mock.calls[0];

    // Error Reporting shape...
    expect(payload['@type']).toBe(REPORTED_ERROR_TYPE);
    expect(payload.serviceContext).toEqual({
      service: 'jobfit-backend',
      version: 'test-rev',
    });
    expect(payload.context.httpRequest).toMatchObject({
      method: 'GET',
      url: '/api/v1/boom',
      responseStatusCode: 500,
    });
    expect(payload.context.user).toBe('user-1');
    // ...with the stack trace as the message (what Error Reporting groups on).
    expect(message).toContain('DB connection exploded');
    expect(message).toContain('at '); // stack frame present

    // Client never sees the internal error message.
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a 4xx at WARN and passes the HttpException message to the client', () => {
    const { host, status, json } = makeHost({
      method: 'POST',
      url: '/api/v1/users',
      headers: {},
      user: undefined,
    });

    filter.catch(new BadRequestException('email must be an email'), host);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [ctx] = logger.warn.mock.calls[0];
    expect(ctx.statusCode).toBe(400);
    expect(ctx['@type']).toBeUndefined(); // not an error event

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'email must be an email' }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
