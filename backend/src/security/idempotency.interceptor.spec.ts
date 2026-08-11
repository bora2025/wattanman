import { CallHandler, ConflictException, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyStore } from './idempotency.store';

describe('IdempotencyInterceptor', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original, NODE_ENV: 'test', REDIS_URL: '' }; });
  afterAll(() => { process.env = original; });

  function context(body: unknown, key = 'request-12345') {
    const request = { method: 'POST', body, originalUrl: '/schools', headers: { 'idempotency-key': key, 'x-tenant-host': 'platform.test' }, user: { userId: 'admin-1' } };
    const response = { statusCode: 201, status: jest.fn(function (code) { this.statusCode = code; return this; }), setHeader: jest.fn() };
    return { execution: { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext, response };
  }

  it('replays a completed mutation without invoking the handler twice', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore());
    const first = context({ name: 'A' });
    const handler: CallHandler = { handle: jest.fn(() => of({ id: 'school-1' })) };
    await expect(lastValueFrom(interceptor.intercept(first.execution, handler))).resolves.toEqual({ id: 'school-1' });
    const replay = context({ name: 'A' });
    await expect(lastValueFrom(interceptor.intercept(replay.execution, handler))).resolves.toEqual({ id: 'school-1' });
    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(replay.response.setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
  });

  it('rejects key reuse with a different payload', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore());
    await lastValueFrom(interceptor.intercept(context({ name: 'A' }).execution, { handle: () => of({ ok: true }) }));
    await expect(lastValueFrom(interceptor.intercept(context({ name: 'B' }).execution, { handle: () => of({ ok: true }) }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases reservations after handler failure so retries can run', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore());
    const failed = context({ name: 'A' });
    await expect(lastValueFrom(interceptor.intercept(failed.execution, { handle: () => throwError(() => new Error('failed')) }))).rejects.toThrow('failed');
    await expect(lastValueFrom(interceptor.intercept(context({ name: 'A' }).execution, { handle: () => of({ ok: true }) }))).resolves.toEqual({ ok: true });
  });
});
