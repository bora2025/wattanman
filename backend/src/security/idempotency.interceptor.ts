import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'crypto';
import { catchError, from, mergeMap, Observable, of, tap, throwError } from 'rxjs';
import { IdempotencyStore } from './idempotency.store';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const rawKey = String(request.headers?.['idempotency-key'] || '').trim();
    if (!MUTATING.has(request.method) || !rawKey) return next.handle();
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(rawKey)) throw new ConflictException('Idempotency-Key must be 8-200 safe characters');
    const scope = `${request.school?.id || request.headers?.['x-tenant-host'] || 'platform'}:${request.user?.userId || 'anonymous'}:${request.method}:${request.originalUrl || request.url}`;
    const key = createHash('sha256').update(`${scope}:${rawKey}`).digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify(request.body ?? null)).digest('hex');
    return from(this.store.reserve(key, fingerprint)).pipe(mergeMap(({ acquired, record }) => {
      if (!acquired) {
        if (record.fingerprint !== fingerprint) throw new ConflictException('Idempotency key was already used with a different payload');
        if (record.state === 'PROCESSING') throw new ConflictException('An identical request is already processing');
        response.status(record.statusCode || response.statusCode);
        response.setHeader('Idempotency-Replayed', 'true');
        return of(record.response);
      }
      return next.handle().pipe(
        mergeMap((body) => {
          const serialized = JSON.stringify(body ?? null);
          if (Buffer.byteLength(serialized) > Number(process.env.IDEMPOTENCY_MAX_RESPONSE_BYTES || 256 * 1024)) {
            return from(this.store.release(key, fingerprint)).pipe(mergeMap(() => throwError(() => new PayloadTooLargeException('Response is too large for idempotent replay'))));
          }
          return from(this.store.complete(key, { fingerprint, state: 'COMPLETED', statusCode: response.statusCode, response: body })).pipe(mergeMap(() => of(body)));
        }),
        catchError((error) => from(this.store.release(key, fingerprint)).pipe(mergeMap(() => throwError(() => error)))),
      );
    }));
  }
}
