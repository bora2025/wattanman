import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { context as otelContext, trace } from '@opentelemetry/api';
import { Request, Response } from 'express';
import { catchError, Observable, tap } from 'rxjs';
import { tenantContext } from '../tenancy/tenant-context';
import { JsonLogger } from './json-logger';
import { telemetryContext } from './telemetry-context';
import { TelemetryMetricsService } from './telemetry-metrics.service';

function header(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

@Injectable()
export class RequestTelemetryInterceptor implements NestInterceptor {
  private readonly logger = new JsonLogger();

  constructor(private readonly metrics?: TelemetryMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = header(request.headers['x-request-id']) || randomUUID();
    const activeSpan = trace.getSpan(otelContext.active());
    const traceId = activeSpan?.spanContext().traceId || header(request.headers['x-trace-id']) || requestId;
    const startedAt = Date.now();
    const finishMetrics = this.metrics?.begin();
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-trace-id', traceId);
    const telemetry = {
      requestId,
      traceId,
      schoolId: tenantContext.getStore()?.schoolId,
      userId: request.user?.userId,
      extensionId: header(request.params?.extensionId),
      versionId: header(request.params?.versionId),
      installationId: header(request.params?.id),
    };
    activeSpan?.setAttributes({
      'wattaman.request.id': requestId,
      ...(telemetry.schoolId ? { 'wattaman.school.id': telemetry.schoolId } : {}),
      ...(telemetry.userId ? { 'enduser.id': telemetry.userId } : {}),
      ...(telemetry.extensionId ? { 'wattaman.extension.id': telemetry.extensionId } : {}),
      ...(telemetry.versionId ? { 'wattaman.extension.version_id': telemetry.versionId } : {}),
      ...(telemetry.installationId ? { 'wattaman.extension.installation_id': telemetry.installationId } : {}),
    });
    return new Observable((subscriber) => telemetryContext.run(telemetry, () => next.handle().pipe(
        tap(() => {
          const durationMs = Date.now() - startedAt;
          void finishMetrics?.(response.statusCode, durationMs);
          this.logger.log({ event: 'http_request', method: request.method, path: request.route?.path || request.path, statusCode: response.statusCode, durationMs, outcome: 'success' }, RequestTelemetryInterceptor.name);
        }),
        catchError((error) => {
          const statusCode = error?.status || 500;
          const durationMs = Date.now() - startedAt;
          void finishMetrics?.(statusCode, durationMs);
          this.logger.error({ event: 'http_request', method: request.method, path: request.route?.path || request.path, statusCode, durationMs, outcome: 'error', error: { name: error?.name, message: error?.message } }, undefined, RequestTelemetryInterceptor.name);
          throw error;
        }),
      ).subscribe(subscriber)));
  }
}
