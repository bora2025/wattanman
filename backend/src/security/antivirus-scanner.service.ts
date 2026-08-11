import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createConnection } from 'net';

export interface AntivirusScanResult {
  clean: boolean;
  engine: 'clamav';
  signature?: string;
}

export interface AntivirusVersion {
  engineVersion: string;
  signatureVersion: string;
}

@Injectable()
export class AntivirusScannerService implements OnModuleInit {
  private cachedVersion?: { value: AntivirusVersion; expiresAt: number };

  async onModuleInit() {
    if (process.env.WORKER_ROLE === 'extension') {
      await this.version();
      await this.scan(Buffer.alloc(0));
    }
  }

  async version(): Promise<AntivirusVersion> {
    if (this.cachedVersion && this.cachedVersion.expiresAt > Date.now()) return this.cachedVersion.value;
    const response = await this.command(Buffer.from('zVERSION\0'));
    const match = /^ClamAV\s+([^/\s]+)\/([^/\s]+)\//.exec(response);
    if (!match) throw new ServiceUnavailableException(`ClamAV returned an invalid version: ${response.slice(0, 200)}`);
    const value = { engineVersion: match[1], signatureVersion: match[2] };
    this.cachedVersion = { value, expiresAt: Date.now() + 5 * 60_000 };
    return value;
  }

  async scan(contents: Buffer): Promise<AntivirusScanResult> {
    return this.scanStream(contents);
  }

  private async command(command: Buffer): Promise<string> {
    return this.socketExchange((socket) => socket.write(command));
  }

  private async scanStream(contents: Buffer): Promise<AntivirusScanResult> {
    const message = await this.socketExchange((socket) => {
      socket.write(Buffer.from('zINSTREAM\0'));
      for (let offset = 0; offset < contents.length; offset += 64 * 1024) {
        const chunk = contents.subarray(offset, Math.min(contents.length, offset + 64 * 1024));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    if (message === 'stream: OK') return { clean: true, engine: 'clamav' };
    const infected = /^stream: (.+) FOUND$/.exec(message);
    if (infected) return { clean: false, engine: 'clamav', signature: infected[1] };
    throw new ServiceUnavailableException(`ClamAV returned an invalid response: ${message.slice(0, 200)}`);
  }

  private async socketExchange(send: (socket: ReturnType<typeof createConnection>) => void): Promise<string> {
    const host = process.env.CLAMAV_HOST?.trim();
    const port = Number(process.env.CLAMAV_PORT || 3310);
    const timeoutMs = Number(process.env.CLAMAV_SCAN_TIMEOUT_MS || 30_000);
    if (!host) throw new ServiceUnavailableException('ClamAV scanner is not configured');
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new ServiceUnavailableException('CLAMAV_PORT is invalid');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new ServiceUnavailableException('CLAMAV_SCAN_TIMEOUT_MS is invalid');

    return new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host, port });
      const responseChunks: Buffer[] = [];
      let responseBytes = 0;
      let settled = false;
      const finish = (error?: Error, result?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(result!);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => send(socket));
      socket.on('data', (chunk: Buffer) => {
        responseBytes += chunk.length;
        if (responseBytes > 4 * 1024) return finish(new ServiceUnavailableException('ClamAV response exceeded the safety limit'));
        responseChunks.push(chunk);
        const response = Buffer.concat(responseChunks);
        const terminator = response.indexOf(0);
        if (terminator < 0) return;
        return finish(undefined, response.subarray(0, terminator).toString('utf8').trim());
      });
      socket.once('timeout', () => finish(new ServiceUnavailableException('ClamAV scan timed out')));
      socket.once('error', (error) => finish(new ServiceUnavailableException(`ClamAV scan failed: ${error.message}`)));
      socket.once('close', () => finish(new ServiceUnavailableException('ClamAV closed the scan before returning a result')));
    });
  }
}
