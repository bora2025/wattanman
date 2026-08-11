import { Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../audit/audit.service';
import { QueueInfrastructureService } from '../jobs/queue-infrastructure.service';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';

@Controller('platform/queues')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class QueueOperationsController {
  constructor(private readonly queues: QueueInfrastructureService, private readonly audit: AuditService) {}

  @Get(':queue/dead-letters/:jobId')
  deadLetter(@Param('queue') queue: string, @Param('jobId') jobId: string) {
    return this.queues.deadLetter(queue, jobId);
  }

  @Post(':queue/dead-letters/:jobId/replay')
  async replay(@Param('queue') queue: string, @Param('jobId') jobId: string, @Request() request: any) {
    const result = await this.queues.replayDeadLetter(queue, jobId);
    await this.audit.log({
      actorId: request.user?.userId,
      actorRole: request.user?.role,
      actorEmail: request.user?.email,
      action: 'REPLAY',
      resource: 'DEAD_LETTER_JOB',
      resourceId: jobId,
      metadata: { queue, replayedJobId: result.jobId },
    });
    return result;
  }
}
