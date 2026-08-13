import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScheduledTaskGuardService } from '../security/scheduled-task-guard.service';
import { ExtensionAlertService } from './extension-alert.service';
import { ObservabilityService } from './observability.service';

type Candidate = { fingerprint: string; type: 'API_SLO' | 'DEPENDENCY_HEALTH' | 'QUEUE_HEALTH'; severity: 'WARNING' | 'CRITICAL'; route: 'TICKET' | 'PAGE'; message: string; details: Record<string, string | number | boolean | null> };

@Injectable()
export class OperationalAlertService {
  private readonly logger = new Logger(OperationalAlertService.name);

  constructor(private readonly observability: ObservabilityService, private readonly alerts: ExtensionAlertService, private readonly schedules: ScheduledTaskGuardService) {}

  @Cron('*/5 * * * *')
  async scan() {
    if (process.env.WORKER_ROLE && process.env.WORKER_ROLE !== 'extension') return { skipped: true };
    if (!(await this.schedules.acquire('operational-alert-scan', 5 * 60_000))) return { skipped: true };
    const snapshot: any = await this.observability.snapshot(15);
    const candidates = this.evaluate(snapshot);
    for (const candidate of candidates) {
      const { alert, notify } = await this.alerts.raiseOperational({
        fingerprint: candidate.fingerprint, type: candidate.type, severity: candidate.severity,
        message: candidate.message, details: { ...candidate.details, route: candidate.route },
      });
      if (notify) await this.dispatch(candidate.route, { id: alert.id, ...candidate });
    }
    await this.alerts.resolveRecoveredOperational(candidates.map((candidate) => candidate.fingerprint));
    return { raised: candidates.length, paged: candidates.filter((candidate) => candidate.route === 'PAGE').length, ticketed: candidates.filter((candidate) => candidate.route === 'TICKET').length };
  }

  evaluate(snapshot: any): Candidate[] {
    const candidates: Candidate[] = [];
    const api = snapshot.api || {};
    if (api.requests >= 100 && (api.availability < 99.9 || api.p95LatencyMs >= 1000)) {
      const critical = api.availability < 99 || api.p95LatencyMs >= 2500;
      candidates.push({ fingerprint: 'API_SLO:PLATFORM', type: 'API_SLO', severity: critical ? 'CRITICAL' : 'WARNING', route: critical ? 'PAGE' : 'TICKET', message: `API availability ${api.availability}% and p95 ${api.p95LatencyMs}ms over ${api.windowMinutes} minutes`, details: { availability: api.availability, p95LatencyMs: api.p95LatencyMs, errorRate: api.errorRate, requests: api.requests, windowMinutes: api.windowMinutes } });
    }
    for (const [name, health] of Object.entries(snapshot.dependencies || {}) as Array<[string, any]>) {
      if (health.status === 'healthy' || health.status === 'unconfigured') continue;
      candidates.push({ fingerprint: `DEPENDENCY_HEALTH:${name.toUpperCase()}`, type: 'DEPENDENCY_HEALTH', severity: 'CRITICAL', route: 'PAGE', message: `${name} dependency is unhealthy`, details: { dependency: name, latencyMs: health.latencyMs ?? null } });
    }
    for (const queue of snapshot.queues || []) {
      const noWorkers = Number(queue.workers || 0) === 0;
      const critical = noWorkers || Number(queue.depth || 0) >= 2000 || Number(queue.oldestJobAgeMs || 0) >= 30 * 60_000;
      const warning = Number(queue.depth || 0) >= 500 || Number(queue.oldestJobAgeMs || 0) >= 5 * 60_000 || Number(queue.counts?.failed || 0) >= 10;
      if (!critical && !warning && queue.status !== 'unhealthy') continue;
      candidates.push({ fingerprint: `QUEUE_HEALTH:${String(queue.queue).toUpperCase()}`, type: 'QUEUE_HEALTH', severity: critical ? 'CRITICAL' : 'WARNING', route: critical ? 'PAGE' : 'TICKET', message: `${queue.queue} queue requires operator attention`, details: { queue: queue.queue, depth: Number(queue.depth || 0), oldestJobAgeMs: Number(queue.oldestJobAgeMs || 0), failed: Number(queue.counts?.failed || 0), workers: Number(queue.workers || 0) } });
    }
    return candidates;
  }

  private async dispatch(route: 'PAGE' | 'TICKET', payload: Record<string, unknown>) {
    const configured = route === 'PAGE' ? process.env.PAGING_WEBHOOK_URL : process.env.TICKET_WEBHOOK_URL;
    if (!configured) {
      this.logger.error(JSON.stringify({ event: 'operational_alert', route, delivery: 'unconfigured', ...payload }));
      return;
    }
    const url = new URL(configured);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error(`${route} webhook must use HTTPS in production`);
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': String(payload.fingerprint) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`${route} webhook failed with ${response.status}`);
  }
}
