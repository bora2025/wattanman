import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, defer, lastValueFrom, throwError } from 'rxjs';
import { CircuitBreakerService } from '../security/circuit-breaker.service';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ExtensionCircuitBreakerInterceptor implements NestInterceptor {
  constructor(private readonly circuit: CircuitBreakerService, private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const path = `${request.baseUrl || ''}${request.route?.path || request.path || ''}`;
    const extensionKey = request.params?.extensionKey;
    if (!/^\/extensions(\/|$)/.test(path) || !extensionKey) return next.handle();
    const normalized = String(extensionKey).toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 64);
    return defer(() => this.circuit.execute(
      `extension-runtime-${normalized}`,
      () => lastValueFrom(next.handle()),
      (error: any) => Number(error?.status || 500) >= 500,
    )).pipe(catchError((error) => {
      if (error?.status === 503 && String(error?.message || '').includes('circuit is open')) void this.raise(extensionKey, error.message);
      return throwError(() => error);
    }));
  }

  private async raise(extensionKey: string, message: string) {
    let schoolId = 'PLATFORM';
    try { schoolId = getCurrentSchoolId(); } catch { /* unresolved bootstrap */ }
    const extension = await this.prisma.extension.findUnique({ where: { key: extensionKey }, select: { id: true } }).catch(() => null);
    const fingerprint = `RUNTIME_CIRCUIT_OPEN:${schoolId}:${extensionKey}`;
    await this.prisma.extensionAlert.upsert({
      where: { fingerprint },
      create: { fingerprint, type: 'RUNTIME_CIRCUIT_OPEN', severity: 'CRITICAL', extensionId: extension?.id, schoolId, message, occurrences: 1, details: { extensionKey } },
      update: { status: 'OPEN', severity: 'CRITICAL', extensionId: extension?.id, message, occurrences: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, resolvedBy: null },
    }).catch(() => undefined);
  }
}
