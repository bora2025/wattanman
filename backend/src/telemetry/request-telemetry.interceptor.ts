import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { catchError, Observable, tap } from 'rxjs';
import { getTenantStore } from '../tenancy/tenant-context';
import { JsonLogger } from './json-logger';
import { telemetryContext } from './telemetry-context';

function header(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

@Injectable()
export class RequestTelemetryInterceptor implements NestInterceptor {
  private readonly logger = new JsonLogger();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = header(request.headers['x-request-id']) || randomUUID();
    const traceId = header(request.headers['x-trace-id']) || requestId;
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-trace-id', traceId);
    const telemetry = {
      requestId,
      traceId,
      schoolId: getTenantStore()?.schoolId,
      userId: request.user?.userId,
      extensionId: header(request.params?.extensionId),
      versionId: header(request.params?.versionId),
      installationId: header(request.params?.id),
    };
    return new Observable((subscriber) => telemetryContext.run(telemetry, () => next.handle().pipe(
        tap(() => this.logger.log({ event: 'http_request', method: request.method, path: request.route?.path || request.path, statusCode: response.statusCode, durationMs: Date.now() - startedAt, outcome: 'success' }, RequestTelemetryInterceptor.name)),
        catchError((error) => {
          this.logger.error({ event: 'http_request', method: request.method, path: request.route?.path || request.path, statusCode: error?.status || 500, durationMs: Date.now() - startedAt, outcome: 'error', error: { name: error?.name, message: error?.message } }, undefined, RequestTelemetryInterceptor.name);
          throw error;
        }),
      ).subscribe(subscriber)));
  }
}
