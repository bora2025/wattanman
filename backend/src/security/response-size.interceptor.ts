import { CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseSizeInterceptor implements NestInterceptor {
  private readonly maxBytes = Number(process.env.API_RESPONSE_MAX_BYTES || 10 * 1024 * 1024);

  constructor() {
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 1024) throw new Error('API_RESPONSE_MAX_BYTES must be an integer of at least 1024');
  }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => {
      if (body === undefined || body === null || Buffer.isBuffer(body)) return body;
      const bytes = Buffer.byteLength(JSON.stringify(body));
      if (bytes > this.maxBytes) throw new PayloadTooLargeException(`Response exceeds ${this.maxBytes} bytes`);
      return body;
    }));
  }
}
