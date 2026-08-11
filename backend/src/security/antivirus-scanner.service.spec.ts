import { createServer, Server } from 'net';
import { AntivirusScannerService } from './antivirus-scanner.service';

describe('AntivirusScannerService', () => {
  const originalEnv = process.env;
  let server: Server | undefined;

  afterEach(async () => {
    process.env = originalEnv;
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function scannerResponse(response: string) {
    server = createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        const request = Buffer.concat(chunks);
        const versionCommand = request.subarray(0, 9).toString('utf8') === 'zVERSION\0';
        const completedStream = request.length >= 4 && request.subarray(-4).equals(Buffer.alloc(4));
        if (versionCommand || completedStream) socket.end(`${response}\0`);
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test scanner did not bind');
    process.env = { ...originalEnv, CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(address.port), CLAMAV_SCAN_TIMEOUT_MS: '2000' };
    return new AntivirusScannerService();
  }

  it('streams package bytes and accepts a clean result', async () => {
    const scanner = await scannerResponse('stream: OK');
    await expect(scanner.scan(Buffer.from('safe package'))).resolves.toEqual({ clean: true, engine: 'clamav' });
  });

  it('returns the detected malware signature', async () => {
    const scanner = await scannerResponse('stream: Win.Test.EICAR_HDB-1 FOUND');
    await expect(scanner.scan(Buffer.from('EICAR test package'))).resolves.toEqual({
      clean: false,
      engine: 'clamav',
      signature: 'Win.Test.EICAR_HDB-1',
    });
  });

  it('records ClamAV engine and signature database versions', async () => {
    const scanner = await scannerResponse('ClamAV 1.4.3/27700/Tue Aug 11 05:00:00 2026');
    await expect(scanner.version()).resolves.toEqual({ engineVersion: '1.4.3', signatureVersion: '27700' });
  });

  it('fails closed on malformed scanner responses', async () => {
    const scanner = await scannerResponse('unexpected');
    await expect(scanner.scan(Buffer.from('package'))).rejects.toThrow('invalid response');
  });
});
