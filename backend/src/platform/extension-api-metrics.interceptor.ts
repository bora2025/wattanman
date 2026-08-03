import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { ExtensionApiMetricsService } from './extension-api-metrics.service';

@Injectable()
export class ExtensionApiMetricsInterceptor implements NestInterceptor {
  constructor(private metrics: ExtensionApiMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const route = this.route(request);
    if (!route) return next.handle();
    const startedAt = Date.now();
    return next.handle().pipe(
      tap(() => this.capture(route, request.method, response.statusCode || 200, startedAt)),
      catchError((error) => {
        this.capture(route, request.method, error?.status || 500, startedAt);
        return throwError(() => error);
      }),
    );
  }

  private capture(route: string, method: string, statusCode: number, startedAt: number) {
    let schoolId = 'PLATFORM';
    try { schoolId = getCurrentSchoolId(); } catch { /* platform bootstrap or unresolved tenant */ }
    void this.metrics.record(route, method, statusCode, Date.now() - startedAt, schoolId).catch(() => undefined);
  }

  private route(request: any) {
    const path = `${request.baseUrl || ''}${request.route?.path || request.path || ''}`;
    return /^\/(platform\/extensions|platform\/extension-installations|extensions)(\/|$)/.test(path) ? path : null;
  }
}
