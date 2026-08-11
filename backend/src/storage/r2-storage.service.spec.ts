import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
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
          'x-amz-content-sha256': expect.stringMatching(/^[a-f0-9]{64}$/),
          'x-amz-date': expect.stringMatching(/^\d{8}T\d{6}Z$/),
        }),
      }),
    );
  });

  it('creates checksum-addressed objects with an atomic no-overwrite condition', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
    const body = Buffer.from('immutable');
    const checksum = createHash('sha256').update(body).digest('hex');

    await service().putPrivateImmutable(`quarantine/${checksum}.zip`, body, 'application/zip', checksum);

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(`/${checksum}.zip`), expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'if-none-match': '*',
        Authorization: expect.stringContaining('if-none-match'),
      }),
    }));
  });

  it('accepts a conditional collision only when stored bytes match', async () => {
    const body = Buffer.from('immutable');
    const checksum = createHash('sha256').update(body).digest('hex');
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 412 })
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) }) as any;

    await expect(service().putPrivateImmutable(`validated/${checksum}/asset.json`, body, 'application/json', checksum)).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('fails closed when an immutable key contains different stored bytes', async () => {
    const body = Buffer.from('immutable');
    const checksum = createHash('sha256').update(body).digest('hex');
    const different = Buffer.from('different');
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 412 })
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => different.buffer.slice(different.byteOffset, different.byteOffset + different.byteLength) }) as any;

    await expect(service().putPrivateImmutable(`validated/${checksum}/asset.json`, body, 'application/json', checksum)).rejects.toThrow(ConflictException);
  });

  it('rejects an immutable write when key and body checksum differ', async () => {
    global.fetch = jest.fn() as any;
    const body = Buffer.from('immutable');
    const wrongChecksum = createHash('sha256').update('different').digest('hex');

    await expect(service().putPrivateImmutable(`validated/${wrongChecksum}/asset.json`, body, 'application/json', wrongChecksum)).rejects.toThrow(ConflictException);
    expect(global.fetch).not.toHaveBeenCalled();
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

  it('creates a short-lived upload URL constrained by content type and checksum metadata', () => {
    const checksum = 'a'.repeat(64);

    const signed = service().presignPrivateUpload('schools/school-1/evidence.pdf', 'application/pdf', checksum);

    const url = new URL(signed.url);
    expect(signed.method).toBe('PUT');
    expect(signed.headers).toEqual({ 'content-type': 'application/pdf', 'x-amz-meta-sha256': checksum });
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Content-Sha256')).toBe('UNSIGNED-PAYLOAD');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host;x-amz-meta-sha256');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reads integrity metadata using an authenticated HEAD request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-length': '1234',
        'content-type': 'application/pdf',
        'x-amz-meta-sha256': 'b'.repeat(64),
      }),
    }) as any;

    await expect(service().headPrivate('schools/school-1/evidence.pdf')).resolves.toEqual({
      contentLength: 1234,
      contentType: 'application/pdf',
      checksum: 'b'.repeat(64),
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'HEAD' }));
  });
});
