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
});
