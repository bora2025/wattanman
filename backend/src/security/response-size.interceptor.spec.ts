import { ExecutionContext, PayloadTooLargeException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseSizeInterceptor } from './response-size.interceptor';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ResponseSizeInterceptor', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original, API_RESPONSE_MAX_BYTES: '1024' }; });
  afterAll(() => { process.env = original; });

  it('passes bounded JSON responses', async () => {
    const interceptor = new ResponseSizeInterceptor();
    await expect(lastValueFrom(interceptor.intercept({} as ExecutionContext, { handle: () => of({ ok: true }) }))).resolves.toEqual({ ok: true });
  });

  it('rejects oversized JSON before serialization', async () => {
    const interceptor = new ResponseSizeInterceptor();
    await expect(lastValueFrom(interceptor.intercept({} as ExecutionContext, { handle: () => of({ data: 'x'.repeat(1100) }) }))).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('disables the implicit parser before installing the configured parser', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
    expect(main).toContain('bodyParser: false');
    expect(main).toContain('API_REQUEST_MAX_BYTES');
    expect(main).toContain('express.json({ limit: requestMaxBytes })');
  });
});
