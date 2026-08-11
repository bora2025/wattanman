import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { CircuitBreakerService } from '../security/circuit-breaker.service';

interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function encodeStorageKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

@Injectable()
export class R2StorageService {
  constructor(private readonly circuits: CircuitBreakerService) {}

  private config(): R2Config {
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    const endpoint = (process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
    const bucket = process.env.R2_BUCKET?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('R2 quarantine storage is not configured');
    }
    return { endpoint, bucket, accessKeyId, secretAccessKey };
  }

  async putPrivate(storageKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.request('PUT', storageKey, body, contentType);
  }

  async putPrivateImmutable(storageKey: string, body: Buffer, contentType: string, checksum: string): Promise<void> {
    const bodyChecksum = sha256(body);
    const checksumSegment = storageKey.split('/').some((segment) => segment === checksum || segment === `${checksum}.zip`);
    if (!/^[a-f0-9]{64}$/.test(checksum) || bodyChecksum !== checksum || !checksumSegment) {
      throw new ConflictException('Immutable R2 object key does not match its content checksum');
    }
    const response = await this.request('PUT', storageKey, body, contentType, { 'If-None-Match': '*' }, [412]);
    if (response.status !== 412) return;
    const existing = await this.getPrivate(storageKey);
    if (existing.length !== body.length || sha256(existing) !== checksum) {
      throw new ConflictException('Immutable R2 object collision detected');
    }
  }

  async deletePrivate(storageKey: string): Promise<void> {
    await this.request('DELETE', storageKey, Buffer.alloc(0), 'application/octet-stream');
  }

  async getPrivate(storageKey: string): Promise<Buffer> {
    const response = await this.request('GET', storageKey, Buffer.alloc(0), 'application/octet-stream');
    return Buffer.from(await response.arrayBuffer());
  }

  async headPrivate(storageKey: string): Promise<{ contentLength: number; contentType: string | null; checksum: string | null }> {
    const response = await this.request('HEAD', storageKey, Buffer.alloc(0), 'application/octet-stream');
    return {
      contentLength: Number(response.headers.get('content-length') || -1),
      contentType: response.headers.get('content-type'),
      checksum: response.headers.get('x-amz-meta-sha256'),
    };
  }

  presignPrivateUpload(storageKey: string, contentType: string, checksum: string, expiresSeconds = 300) {
    return this.presign('PUT', storageKey, expiresSeconds, {
      'content-type': contentType,
      'x-amz-meta-sha256': checksum,
    });
  }

  presignPrivateDownload(storageKey: string, expiresSeconds = 300) {
    return this.presign('GET', storageKey, expiresSeconds, {});
  }

  private presign(
    method: 'PUT' | 'GET',
    storageKey: string,
    expiresSeconds: number,
    requiredHeaders: Record<string, string>,
  ) {
    if (!Number.isInteger(expiresSeconds) || expiresSeconds < 60 || expiresSeconds > 900) {
      throw new ConflictException('Signed R2 URL expiry must be between 60 and 900 seconds');
    }
    const config = this.config();
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodeStorageKey(storageKey)}`;
    const host = new URL(config.endpoint).host;
    const headers = { host, ...requiredHeaders };
    const headerNames = Object.keys(headers).sort();
    const signedHeaders = headerNames.join(';');
    const canonicalHeaders = headerNames.map((name) => `${name}:${headers[name].trim()}\n`).join('');
    const query = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresSeconds),
      'X-Amz-SignedHeaders': signedHeaders,
    };
    const canonicalQuery = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`)
      .join('&');
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
    const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, 'auto');
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return {
      url: `${config.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      method,
      headers: requiredHeaders,
      expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
    };
  }

  private async request(
    method: 'PUT' | 'GET' | 'HEAD' | 'DELETE',
    storageKey: string,
    body: Buffer,
    contentType: string,
    extraHeaders: Record<string, string> = {},
    acceptedStatuses: number[] = [],
  ): Promise<Response> {
    const config = this.config();
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body);
    const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodeStorageKey(storageKey)}`;
    const host = new URL(config.endpoint).host;
    const requestHeaders: Record<string, string> = {
      'content-type': contentType,
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...Object.fromEntries(Object.entries(extraHeaders).map(([key, value]) => [key.toLowerCase(), value.trim()])),
    };
    const headerNames = Object.keys(requestHeaders).sort();
    const canonicalHeaders = headerNames.map((name) => `${name}:${requestHeaders[name]}\n`).join('');
    const signedHeaders = headerNames.join(';');
    const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
    const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, 'auto');
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return this.circuits.execute('r2', async () => {
      const response = await fetch(`${config.endpoint}${canonicalUri}`, {
        method,
        headers: {
          Authorization: authorization,
          ...Object.fromEntries(Object.entries(requestHeaders).filter(([name]) => name !== 'host')),
        },
        ...(method === 'PUT' ? { body: body as unknown as BodyInit } : {}),
      });
      if (!response.ok && !acceptedStatuses.includes(response.status)) {
        const detail = await response.text().catch(() => '');
        const operation = method === 'PUT' ? 'upload' : method === 'GET' ? 'download' : 'delete';
        throw new ServiceUnavailableException(`R2 ${operation} failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }
      return response;
    });
  }
}
