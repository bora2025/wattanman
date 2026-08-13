import { propagation } from '@opentelemetry/api';
import { QueueInfrastructureService } from './queue-infrastructure.service';
import { telemetryContext } from '../telemetry/telemetry-context';

describe('queue tracing', () => {
  it('propagates the active request trace and W3C carrier into the job envelope', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'bull-job-1' });
    const service = Object.create(QueueInfrastructureService.prototype) as QueueInfrastructureService;
    (service as any).queue = jest.fn(() => ({ add }));
    jest.spyOn(propagation, 'inject').mockImplementation((_context, carrier: any) => {
      carrier.traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    });

    await telemetryContext.run({ requestId: 'request-1', traceId: '4bf92f3577b34da6a3ce929d0e0e4736' }, () => service.enqueue('extensions', {
      type: 'extension.lifecycle.execute',
      tenant: { mode: 'SCOPED', schoolId: 'school-1' },
      actor: { id: 'admin-1', role: 'ADMIN' },
      idempotencyKey: 'command-1',
      payload: { jobId: 'lifecycle-1' },
    }));

    expect(add).toHaveBeenCalledWith('extension.lifecycle.execute', expect.objectContaining({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    }), expect.any(Object));
  });
});
