import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueInfrastructureService } from './queue-infrastructure.service';
import { ScheduledTaskGuardService } from '../security/scheduled-task-guard.service';

export type QueueHealthAlert = {
  queue: string;
  code: 'QUEUE_DEPTH_HIGH' | 'QUEUE_OLDEST_JOB_HIGH' | 'QUEUE_SCAN_FAILED';
  severity: 'warning' | 'critical';
  value?: number;
  threshold?: number;
  message: string;
};

@Injectable()
export class QueueHealthMonitorService {
  private readonly logger = new Logger(QueueHealthMonitorService.name);
  private readonly queueNames = (process.env.QUEUE_MONITORED_NAMES || 'extensions,operations,notifications')
    .split(',').map((name) => name.trim()).filter(Boolean);
  private readonly depthWarning = Number(process.env.QUEUE_DEPTH_WARNING || 500);
  private readonly depthCritical = Number(process.env.QUEUE_DEPTH_CRITICAL || 2000);
  private readonly ageWarningMs = Number(process.env.QUEUE_OLDEST_JOB_WARNING_MS || 5 * 60_000);
  private readonly ageCriticalMs = Number(process.env.QUEUE_OLDEST_JOB_CRITICAL_MS || 30 * 60_000);
  private latest: { checkedAt: string; queues: unknown[]; alerts: QueueHealthAlert[] } | null = null;

  constructor(private readonly queues: QueueInfrastructureService, private readonly schedules: ScheduledTaskGuardService) {
    if (this.depthWarning < 1 || this.depthCritical < this.depthWarning) throw new Error('Invalid queue depth alert thresholds');
    if (this.ageWarningMs < 1 || this.ageCriticalMs < this.ageWarningMs) throw new Error('Invalid queue age alert thresholds');
  }

  @Cron('* * * * *')
  async scan() {
    if (!(await this.schedules.acquire('queue-health-scan', 60_000))) return this.latest;
    const snapshots: unknown[] = [];
    const alerts: QueueHealthAlert[] = [];
    for (const queue of this.queueNames) {
      try {
        const snapshot = await this.queues.health(queue);
        snapshots.push(snapshot);
        this.thresholdAlerts(queue, snapshot.depth, this.depthWarning, this.depthCritical, 'QUEUE_DEPTH_HIGH', alerts);
        this.thresholdAlerts(queue, snapshot.oldestJobAgeMs, this.ageWarningMs, this.ageCriticalMs, 'QUEUE_OLDEST_JOB_HIGH', alerts);
      } catch (error) {
        alerts.push({ queue, code: 'QUEUE_SCAN_FAILED', severity: 'critical', message: error instanceof Error ? error.message : 'Queue scan failed' });
      }
    }
    this.latest = { checkedAt: new Date().toISOString(), queues: snapshots, alerts };
    for (const alert of alerts) this.logger.error(JSON.stringify({ event: 'queue_health_alert', ...alert }));
    return this.latest;
  }

  status() {
    return this.latest;
  }

  private thresholdAlerts(queue: string, value: number, warning: number, critical: number, code: QueueHealthAlert['code'], alerts: QueueHealthAlert[]) {
    if (value < warning) return;
    const threshold = value >= critical ? critical : warning;
    const severity = value >= critical ? 'critical' : 'warning';
    alerts.push({ queue, code, severity, value, threshold, message: `${code} for ${queue}: ${value} >= ${threshold}` });
  }
}
