import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('load test contract', () => {
  const root = resolve(process.cwd(), '..', 'load-test');

  it('defines normal, peak, burst, and failure profiles at certification rates', () => {
    const profiles = JSON.parse(readFileSync(resolve(root, 'profiles.json'), 'utf8'));
    expect(Object.keys(profiles).sort()).toEqual(['burst', 'failure', 'normal', 'peak']);
    expect(profiles.peak).toEqual(expect.objectContaining({ rate: 1000, duration: '2h' }));
    expect(profiles.burst.stages).toContainEqual(expect.objectContaining({ target: 3000 }));
  });

  it('fails closed on production hosts and emits cost evidence', () => {
    const source = readFileSync(resolve(root, 'wattaman.js'), 'utf8');
    expect(source).toContain("LOAD_TEST_AUTHORIZATION !== 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY'");
    expect(source).toContain("host.endsWith('.up.railway.app')");
    expect(source).toContain("/(^|\\.)wattaman\\.app$/");
    expect(source).toContain('estimatedCostUsd');
    expect(source).toContain('LOAD_COST_PER_MILLION_REQUESTS_USD');
    expect(source).toContain("'authenticated status is 200'");
    expect(source).not.toContain('[200, 401, 403]');
    expect(source).toContain('LOAD_TEST_SESSIONS || 10000');
  });
});
