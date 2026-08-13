import { LoggerService } from '@nestjs/common';
import { telemetryContext } from './telemetry-context';

const SECRET_KEYS = /authorization|cookie|password|secret|token|private.?key|api.?key|credential|mfa|otp|session|signature|headers|body|payload|form.?data|raw.?content/i;

function sanitizeString(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:access_token|token|password|secret|api[_-]?key|signature)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/("(?:password|secret|token|authorization|cookie|privateKey|apiKey)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/\b((?:postgres(?:ql)?|redis(?:s)?)\:\/\/)[^:@/\s]+:[^@/\s]+@/gi, '$1[REDACTED]@')
    .slice(0, 4096);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (value instanceof Error) return { name: value.name, message: sanitizeString(value.message), stack: value.stack ? sanitizeString(value.stack) : undefined };
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEYS.test(key) ? '[REDACTED]' : sanitize(item, depth + 1),
    ]));
  }
  if (typeof value === 'string') return sanitizeString(value);
  return value;
}

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) { this.write('info', message, context); }
  error(message: unknown, trace?: string, context?: string) { this.write('error', message, context, trace); }
  warn(message: unknown, context?: string) { this.write('warn', message, context); }
  debug(message: unknown, context?: string) { this.write('debug', message, context); }
  verbose(message: unknown, context?: string) { this.write('trace', message, context); }

  private write(level: string, message: unknown, context?: string, trace?: string) {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: process.env.RAILWAY_SERVICE_NAME || process.env.SERVICE_NAME || 'wattaman-api',
      context,
      ...telemetryContext.current(),
      message: sanitize(message),
      ...(trace ? { stack: sanitizeString(trace) } : {}),
    };
    const output = JSON.stringify(record);
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
  }
}
