import { createHash } from 'crypto';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler.storage';

function request(context: ExecutionContext): any { return context.switchToHttp().getRequest(); }
function tokenIdentity(req: any) {
  const token = String(req.headers?.authorization || 'anonymous');
  return createHash('sha256').update(token).digest('hex').slice(0, 24);
}
function route(req: any) { return `${req.method || 'UNKNOWN'}:${req.route?.path || req.path || req.url || '/'}`; }

export function distributedRateLimitOptions(): ThrottlerModuleOptions {
  return {
    storage: new RedisThrottlerStorage(),
    throttlers: [
      { name: 'ip', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_IP_PER_MINUTE || 300), getTracker: (req) => req.ip || req.socket?.remoteAddress || 'unknown' },
      { name: 'user', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_USER_PER_MINUTE || 240), getTracker: (req) => tokenIdentity(req) },
      { name: 'school', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_SCHOOL_PER_MINUTE || 1200), getTracker: (req) => req.school?.id || req.headers?.['x-tenant-host'] || req.hostname || 'unknown' },
      { name: 'extension', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_EXTENSION_PER_MINUTE || 600), getTracker: (req) => `${req.params?.extensionKey || req.params?.key || 'none'}:${req.school?.id || req.hostname || 'unknown'}`, skipIf: (context) => !/\/extensions\//.test(route(request(context))) },
      { name: 'sensitive', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_SENSITIVE_PER_MINUTE || 30), blockDuration: 5 * 60_000, getTracker: (req) => `${tokenIdentity(req)}:${route(req)}`, skipIf: (context) => ['GET', 'HEAD', 'OPTIONS'].includes(request(context).method) },
    ],
  };
}
