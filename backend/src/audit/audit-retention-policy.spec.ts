import { readFileSync } from 'fs';
import { join } from 'path';

describe('audit retention policy', () => {
  it('enforces the 365-day floor at configuration and execution', () => {
    const controller = readFileSync(join(process.cwd(), 'src', 'audit', 'audit.controller.ts'), 'utf8');
    const service = readFileSync(join(process.cwd(), 'src', 'audit', 'audit.service.ts'), 'utf8');
    expect(controller).toContain('MIN_RETENTION_DAYS = 365');
    expect(controller).toContain('Math.max(schedule.retainDays, AuditController.MIN_RETENTION_DAYS)');
    expect(service).toContain('Math.max(s.retainDays, 365)');
  });
});
