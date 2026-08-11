import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import { tenantContext } from '../tenancy/tenant-context';
import { PrismaService } from './prisma.service';

@Injectable()
export class TenantDatabaseInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenant = tenantContext.getStore();
    if (!tenant || tenant.mode === 'unscoped') return next.handle();
    return from(this.prisma.runInTenantTransaction(tenant.schoolId, () => lastValueFrom(next.handle())));
  }
}
