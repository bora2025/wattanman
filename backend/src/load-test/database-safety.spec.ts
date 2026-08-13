import { approvedSyntheticOrigin, assertLoadTestDatabaseConfiguration, assertSyntheticOnlySchools } from './database-safety';

describe('load database safety', () => {
  it('accepts only explicitly authorized marked databases', () => {
    expect(assertLoadTestDatabaseConfiguration({ databaseUrl: 'postgresql://user:secret@db.performance.internal/wattaman_loadtest', authorization: 'I_AUTHORIZE_DESTRUCTIVE_ISOLATED_LOAD_DATA', environment: 'test' })).toContain('performance.internal');
    expect(() => assertLoadTestDatabaseConfiguration({ databaseUrl: 'postgresql://user:secret@postgres.railway.internal/railway', authorization: 'I_AUTHORIZE_DESTRUCTIVE_ISOLATED_LOAD_DATA', environment: 'test' })).toThrow('non-production marker');
    expect(() => assertLoadTestDatabaseConfiguration({ databaseUrl: 'postgresql://user:secret@db.performance.internal/wattaman_loadtest', authorization: '', environment: 'test' })).toThrow('acknowledgement');
  });

  it('aborts when a database contains a real school', () => {
    expect(() => assertSyntheticOnlySchools([{ id: 'real-1', subdomain: 'customer' }])).toThrow('non-synthetic');
    expect(() => assertSyntheticOnlySchools([{ id: 'platform-id', subdomain: 'platform' }, { id: 'load-school-0001', subdomain: 'load-school-0001' }])).not.toThrow();
  });

  it('rejects public production origins', () => {
    expect(approvedSyntheticOrigin('https://{subdomain}.performance.example', 'load-school-0001')).toBe('https://load-school-0001.performance.example');
    expect(() => approvedSyntheticOrigin('https://{subdomain}.wattanman.app', 'load-school-0001')).toThrow('forbidden');
  });
});
