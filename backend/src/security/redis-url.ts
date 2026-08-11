export function assertProductionRedisUrl(url?: string) {
  if (process.env.NODE_ENV !== 'production') return;
  if (!url) throw new Error('Production REDIS_URL is required');
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error('Production REDIS_URL is invalid'); }
  const privateRailway = parsed.protocol === 'redis:' && parsed.hostname.endsWith('.railway.internal');
  if (parsed.protocol !== 'rediss:' && !privateRailway) {
    throw new Error('Production REDIS_URL must use TLS or Railway private networking');
  }
}
