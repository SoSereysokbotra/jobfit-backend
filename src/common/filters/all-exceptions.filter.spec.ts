import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';

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

describe('AllExceptionsFilter', () => {
  let logger: { error: jest.Mock; warn: jest.Mock };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = { error: jest.fn(), warn: jest.fn() };
    filter = new AllExceptionsFilter(logger as unknown as PinoLogger);
  });

  it('logs a 5xx at ERROR with full context and returns a generic client message', () => {
    const { host, status, json } = makeHost({
      method: 'GET',
      url: '/api/v1/boom',
      user: { id: 'user-1' },
    });

    filter.catch(new Error('DB connection exploded'), host);

    // Logged at ERROR with full server-side context...
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [ctx, msg] = logger.error.mock.calls[0];
    expect(ctx).toMatchObject({
      method: 'GET',
      path: '/api/v1/boom',
      statusCode: 500,
      userId: 'user-1',
    });
    expect(ctx.err.message).toBe('DB connection exploded');
    expect(ctx.err.stack).toBeDefined();
    expect(msg).toContain('/api/v1/boom');

    // ...but the client never sees the internal error message.
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
      user: undefined,
    });

    filter.catch(new BadRequestException('email must be an email'), host);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [ctx] = logger.warn.mock.calls[0];
    expect(ctx.statusCode).toBe(400);
    expect(ctx.err.stack).toBeUndefined(); // no stack noise on 4xx

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'email must be an email' }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
