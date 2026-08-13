import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('incident response rehearsal', () => {
  it('ships an executable rehearsal command', () => {
    const source = readFileSync(resolve(process.cwd(), 'src', 'cli', 'rehearse-incident-response.ts'), 'utf8');
    expect(source).toContain("outcome: 'PASSED'");
    expect(source).toContain("expected: 'DEPENDENCY_HEALTH:DATABASE'");
    expect(source).toContain("expected: 'DEPENDENCY_HEALTH:R2'");
    expect(source).toContain("expected: 'QUEUE_HEALTH:OPERATIONS'");
  });
});
