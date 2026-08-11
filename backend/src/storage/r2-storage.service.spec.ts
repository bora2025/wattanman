import { ServiceUnavailableException } from '@nestjs/common';
import { R2StorageService } from './r2-storage.service';

describe('R2StorageService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const circuits = { execute: jest.fn((_name, operation) => operation()) };
  const service = () => new R2StorageService(circuits as any);

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      R2_BUCKET: 'extensions',
      R2_ACCESS_KEY_ID: 'access-key',
      R2_SECRET_ACCESS_KEY: 'secret-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends a private SigV4-authenticated object upload', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
    const storage = service();

    await storage.putPrivate('quarantine/extensions/a package.zip', Buffer.from('zip'), 'application/zip');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://account.r2.cloudflarestorage.com/extensions/quarantine/extensions/a%20package.zip',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('AWS4-HMAC-SHA256 Credential=access-key/'),
          'X-Amz-Content-Sha256': expect.stringMatching(/^[a-f0-9]{64}$/),
          'X-Amz-Date': expect.stringMatching(/^\d{8}T\d{6}Z$/),
        }),
      }),
    );
  });

  it('fails closed when R2 credentials are missing', async () => {
    delete process.env.R2_SECRET_ACCESS_KEY;

    await expect(service().putPrivate('test.zip', Buffer.from('zip'), 'application/zip')).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not hide R2 upload failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' }) as any;

    await expect(service().putPrivate('test.zip', Buffer.from('zip'), 'application/zip')).rejects.toThrow('R2 upload failed (503)');
  });

  it('signs private object deletion without sending a body', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;

    await service().deletePrivate('quarantine/test.zip');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://account.r2.cloudflarestorage.com/extensions/quarantine/test.zip',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect((global.fetch as jest.Mock).mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('downloads a private object through a signed request', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }) as any;

    const result = await service().getPrivate('validated/style.css');

    expect(result).toEqual(Buffer.from([1, 2, 3]));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/validated/style.css'), expect.objectContaining({ method: 'GET' }));
  });
});
