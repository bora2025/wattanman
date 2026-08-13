import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, defer, finalize, switchMap } from 'rxjs';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { ExtensionResourceGovernorService } from './extension-resource-governor.service';

@Injectable()
export class ExtensionResourceGovernorInterceptor implements NestInterceptor {
  constructor(private readonly governor: ExtensionResourceGovernorService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const path = `${request.baseUrl || ''}${request.route?.path || request.path || ''}`;
    if (!/^\/extensions(\/|$)/.test(path)) return next.handle();
    return defer(async () => {
      const schoolId = getCurrentSchoolId();
      const extensionKey = request.params?.extensionKey || 'NAVIGATION';
      return this.governor.enterRequest(schoolId, extensionKey);
    }).pipe(switchMap((release) => next.handle().pipe(finalize(() => { void release(); }))));
  }
}
