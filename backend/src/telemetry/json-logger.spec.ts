import { JsonLogger } from './json-logger';
import { telemetryContext } from './telemetry-context';

describe('JsonLogger', () => {
  it('emits correlated JSON and redacts secret fields', () => {
    const output = jest.spyOn(console, 'log').mockImplementation();
    telemetryContext.run({ requestId: 'request-1', traceId: 'trace-1', schoolId: 'school-1' }, () => {
      new JsonLogger().log({ event: 'test', password: 'secret', nested: { accessToken: 'token' } }, 'TelemetryTest');
    });

    const record = JSON.parse(output.mock.calls[0][0] as string);
    expect(record).toEqual(expect.objectContaining({ level: 'info', requestId: 'request-1', traceId: 'trace-1', schoolId: 'school-1', context: 'TelemetryTest' }));
    expect(record.message).toEqual({ event: 'test', password: '[REDACTED]', nested: { accessToken: '[REDACTED]' } });
    output.mockRestore();
  });

  it('redacts credentials from free-form errors, URLs, bearer tokens, and raw payloads', () => {
    const output = jest.spyOn(console, 'error').mockImplementation();
    new JsonLogger().error({
      event: 'failure',
      error: new Error('postgresql://user:pass@db/test?token=abc Bearer ey.secret.value'),
      payload: { harmless: false },
      note: '-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----',
    }, 'redis://default:redispass@redis/test?password=visible', 'TelemetryTest');
    const serialized = output.mock.calls[0][0] as string;
    expect(serialized).not.toContain('user:pass');
    expect(serialized).not.toContain('redispass');
    expect(serialized).not.toContain('private-material');
    expect(serialized).not.toContain('ey.secret.value');
    expect(serialized).not.toContain('"harmless":false');
    expect(serialized).toContain('[REDACTED]');
    output.mockRestore();
  });
});
