import { toReportedErrorEvent, REPORTED_ERROR_TYPE } from './error-reporting';

const baseCtx = {
  service: 'jobfit-backend',
  version: 'rev-123',
  method: 'GET',
  path: '/api/v1/x',
  statusCode: 500,
};

describe('toReportedErrorEvent', () => {
  it('marks the payload as a ReportedErrorEvent with serviceContext', () => {
    const { payload } = toReportedErrorEvent(new Error('boom'), baseCtx);
    expect(payload['@type']).toBe(REPORTED_ERROR_TYPE);
    expect(payload.serviceContext).toEqual({
      service: 'jobfit-backend',
      version: 'rev-123',
    });
  });

  it('uses the stack trace as the message (grouping key)', () => {
    const err = new Error('boom');
    const { message } = toReportedErrorEvent(err, baseCtx);
    expect(message).toContain('Error: boom');
    expect(message).toContain('at '); // real stack frames
  });

  it('includes httpRequest context and user when present', () => {
    const { payload } = toReportedErrorEvent(new Error('boom'), {
      ...baseCtx,
      userId: 'user-9',
      userAgent: 'curl/8',
      remoteIp: '203.0.113.5',
    });
    expect(payload.context).toMatchObject({
      httpRequest: {
        method: 'GET',
        url: '/api/v1/x',
        responseStatusCode: 500,
        userAgent: 'curl/8',
        remoteIp: '203.0.113.5',
      },
      user: 'user-9',
    });
  });

  it('omits user when not provided', () => {
    const { payload } = toReportedErrorEvent(new Error('boom'), baseCtx);
    expect((payload.context as Record<string, unknown>).user).toBeUndefined();
  });

  it('handles non-Error throwables', () => {
    const { message, payload } = toReportedErrorEvent('a string blew up', baseCtx);
    expect(message).toBe('a string blew up');
    expect(payload['@type']).toBe(REPORTED_ERROR_TYPE);
  });
});
