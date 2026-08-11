import { ExtensionWorkerProcessorService } from './extension-worker-processor.service';
import { NotificationWorkerProcessorService } from './notification-worker-processor.service';

describe('dedicated queue processors', () => {
  it('routes supported extension jobs and rejects unknown work', async () => {
    let handler: (envelope: any) => Promise<unknown>;
    const queues = { createWorker: jest.fn((_name, callback) => { handler = callback; }) };
    const cleanup = { run: jest.fn().mockResolvedValue('clean') };
    const updates = { run: jest.fn().mockResolvedValue('update') };
    const alerts = { scan: jest.fn().mockResolvedValue('alert') };
    const extensions = { completePackageUpload: jest.fn().mockResolvedValue('complete') };
    new ExtensionWorkerProcessorService(queues as any, cleanup as any, updates as any, alerts as any, extensions as any).onModuleInit();
    expect(queues.createWorker).toHaveBeenCalledWith('extensions', expect.any(Function));
    await expect(handler!({ type: 'extension.package.complete', payload: { versionId: 'v', checksum: 'c', validationId: 'x' }, actor: { id: 'u', role: 'PLATFORM_ADMIN' } })).resolves.toBe('complete');
    expect(extensions.completePackageUpload).toHaveBeenCalledWith(expect.objectContaining({ versionId: 'v' }), expect.objectContaining({ userId: 'u' }));
    await expect(handler!({ type: 'extension.cleanup' })).resolves.toBe('clean');
    await expect(handler!({ type: 'unknown' })).rejects.toThrow('Unsupported extension job type');
  });

  it('validates and delivers notification payloads', async () => {
    let handler: (envelope: any) => Promise<unknown>;
    const queues = { createWorker: jest.fn((_name, callback) => { handler = callback; }) };
    const delivery = { sendEmail: jest.fn().mockResolvedValue(undefined), sendSms: jest.fn().mockResolvedValue(undefined) };
    new NotificationWorkerProcessorService(queues as any, delivery as any).onModuleInit();
    await expect(handler!({ type: 'notification.email', payload: { to: 'a@example.com', subject: 'Ready', text: 'Done' } })).resolves.toEqual({ delivered: true, channel: 'email' });
    expect(delivery.sendEmail).toHaveBeenCalledWith('a@example.com', 'Ready', 'Done');
    await expect(handler!({ type: 'notification.sms', payload: {} })).rejects.toThrow('Invalid SMS notification payload');
  });
});
