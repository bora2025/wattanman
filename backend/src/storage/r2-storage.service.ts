import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';

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

@Injectable()
export class R2StorageService {
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

  async deletePrivate(storageKey: string): Promise<void> {
    await this.request('DELETE', storageKey, Buffer.alloc(0), 'application/octet-stream');
  }

  async getPrivate(storageKey: string): Promise<Buffer> {
    const response = await this.request('GET', storageKey, Buffer.alloc(0), 'application/octet-stream');
    return Buffer.from(await response.arrayBuffer());
  }

  private async request(method: 'PUT' | 'GET' | 'DELETE', storageKey: string, body: Buffer, contentType: string): Promise<Response> {
    const config = this.config();
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body);
    const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodeStorageKey(storageKey)}`;
    const host = new URL(config.endpoint).host;
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;
    const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, 'auto');
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`${config.endpoint}${canonicalUri}`, {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': contentType,
        'X-Amz-Content-Sha256': payloadHash,
        'X-Amz-Date': amzDate,
      },
      ...(method === 'PUT' ? { body: body as unknown as BodyInit } : {}),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const operation = method === 'PUT' ? 'upload' : method === 'GET' ? 'download' : 'delete';
      throw new ServiceUnavailableException(`R2 ${operation} failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    return response;
  }
}
