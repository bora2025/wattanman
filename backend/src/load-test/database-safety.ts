export function assertLoadTestDatabaseConfiguration(input: { databaseUrl?: string; authorization?: string; environment?: string }) {
  if (input.authorization !== 'I_AUTHORIZE_DESTRUCTIVE_ISOLATED_LOAD_DATA') throw new Error('LOAD_TEST_DATABASE_AUTHORIZATION acknowledgement is required');
  if (input.environment === 'production') throw new Error('NODE_ENV=production is forbidden for load provisioning');
  if (!input.databaseUrl) throw new Error('LOAD_TEST_DATABASE_URL is required');
  const url = new URL(input.databaseUrl);
  const marker = `${url.hostname}/${url.pathname}`.toLowerCase();
  if (!/(loadtest|load-test|performance|perf|staging)/.test(marker)) throw new Error('Load-test database hostname or database name must contain a non-production marker');
  if (/railway\.internal/i.test(url.hostname) && !/(loadtest|load-test|performance|perf|staging)/.test(url.pathname)) throw new Error('Unmarked Railway database is forbidden');
  return url.toString();
}

export function assertSyntheticOnlySchools(schools: Array<{ id: string; subdomain: string }>) {
  const unexpected = schools.filter((school) => school.subdomain !== 'platform' && !school.id.startsWith('load-school-'));
  if (unexpected.length) throw new Error(`Load-test database contains ${unexpected.length} non-synthetic schools`);
}

export function approvedSyntheticOrigin(template: string, subdomain: string) {
  if (!template.includes('{subdomain}')) throw new Error('LOAD_TEST_SCHOOL_ORIGIN_TEMPLATE must contain {subdomain}');
  const url = new URL(template.replace('{subdomain}', subdomain));
  const host = url.hostname.toLowerCase();
  if (['wattaman.app', 'wattanman.app'].includes(host) || host.endsWith('.wattaman.app') || host.endsWith('.wattanman.app') || host.endsWith('.up.railway.app')) throw new Error('Production school origin is forbidden');
  if (!(host === 'localhost' || host === '127.0.0.1' || /(loadtest|performance|perf|staging)/.test(host))) throw new Error('School origin is not an approved performance host');
  return url.origin;
}

export function assertLoadTestHttpTarget(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (['wattaman.app', 'wattanman.app'].includes(host) || host.endsWith('.wattaman.app') || host.endsWith('.wattanman.app') || host.endsWith('.up.railway.app')) throw new Error('Production HTTP target is forbidden');
  if (!(host === 'localhost' || host === '127.0.0.1' || /(loadtest|performance|perf|staging)/.test(host))) throw new Error('HTTP target is not an approved performance host');
  if (process.env.LOAD_TEST_AUTHORIZATION !== 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY') throw new Error('LOAD_TEST_AUTHORIZATION acknowledgement is required');
  return url.origin;
}
