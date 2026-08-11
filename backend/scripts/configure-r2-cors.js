const { createHash, createHmac } = require('crypto');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function xml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function configuration() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const endpoint = (process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const origins = (process.env.R2_BROWSER_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('R2 storage credentials are incomplete');
  if (!origins.length) throw new Error('R2_BROWSER_ORIGINS must contain exact comma-separated frontend origins');
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (origin.includes('*') || parsed.origin !== origin || (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost')) {
      throw new Error(`Unsafe R2 browser origin: ${origin}`);
    }
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, origins };
}

async function putCors(config) {
  const body = Buffer.from([
    '<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
    '<CORSRule>',
    ...config.origins.map((origin) => `<AllowedOrigin>${xml(origin)}</AllowedOrigin>`),
    '<AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>',
    '<AllowedHeader>Content-Type</AllowedHeader><AllowedHeader>x-amz-meta-sha256</AllowedHeader>',
    '<ExposeHeader>ETag</ExposeHeader><ExposeHeader>Content-Length</ExposeHeader><ExposeHeader>Content-Type</ExposeHeader><ExposeHeader>x-amz-meta-sha256</ExposeHeader>',
    '<MaxAgeSeconds>3600</MaxAgeSeconds>',
    '</CORSRule>',
    '</CORSConfiguration>',
  ].join(''));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalUri = `/${encodeURIComponent(config.bucket)}`;
  const host = new URL(config.endpoint).host;
  const canonicalHeaders = `content-type:application/xml\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\ncors=\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const response = await fetch(`${config.endpoint}${canonicalUri}?cors=`, {
    method: 'PUT',
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Type': 'application/xml',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
  });
  if (!response.ok) throw new Error(`R2 PutBucketCors failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

async function verifyCors(config) {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const failures = [];
    for (const origin of config.origins) {
      const response = await fetch(`${config.endpoint}/${encodeURIComponent(config.bucket)}/cors-probe`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type,x-amz-meta-sha256',
        },
      });
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      if (!response.ok || allowedOrigin !== origin) failures.push(`${origin} (${response.status})`);
    }
    if (!failures.length) return;
    if (attempt === 6) throw new Error(`R2 CORS verification failed for ${failures.join(', ')}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function main() {
  const config = configuration();
  await putCors(config);
  await verifyCors(config);
  console.log(`R2 browser CORS configured for ${config.origins.length} exact origin(s).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
