import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, mergeMap, Observable } from 'rxjs';
import { DISTRIBUTED_COMMAND_LOCK, DistributedCommandLockScope } from './distributed-command-lock.decorator';
import { DistributedLockService } from './distributed-lock.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DistributedCommandLockInterceptor implements NestInterceptor {
  constructor(
    private readonly locks: DistributedLockService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = this.reflector.getAllAndOverride<DistributedCommandLockScope>(DISTRIBUTED_COMMAND_LOCK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope) return next.handle();
    const request = context.switchToHttp().getRequest();
    return from(this.resource(scope, request)).pipe(
      mergeMap((resource) => this.locks.run(resource, () => lastValueFrom(next.handle()))),
    );
  }

  private async resource(scope: DistributedCommandLockScope, request: any) {
    if (scope === 'EXTENSION') return `extension:${request.params?.extensionId || 'unknown'}`;
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id: request.params?.id || '' },
      select: { schoolId: true, extensionId: true },
    });
    if (installation) return `school:${installation.schoolId}:extension:${installation.extensionId}`;
    const tenant = request.school?.id || request.headers?.['x-tenant-host'] || 'platform';
    return `school:${tenant}:installation:${request.params?.id || 'unknown'}`;
  }
}
