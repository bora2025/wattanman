import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const profiles = JSON.parse(open('./profiles.json'));
const profileName = __ENV.LOAD_TEST_PROFILE || 'normal';
const profile = profiles[profileName];
if (!profile) throw new Error(`Unknown LOAD_TEST_PROFILE ${profileName}`);

export const options = {
  scenarios: { wattaman: { ...profile, exec: 'schoolTraffic' } },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2500'],
    checks: ['rate>0.99'],
    dropped_iterations: ['count==0'],
  },
  tags: { profile: profileName },
};

function target() {
  const raw = __ENV.LOAD_TEST_TARGET;
  if (!raw) throw new Error('LOAD_TEST_TARGET is required');
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const approvedHost = host === 'localhost' || host === '127.0.0.1' || /(loadtest|performance|perf|staging)/.test(host);
  if (!approvedHost || /(^|\.)wattaman\.app$/.test(host) || host.endsWith('.up.railway.app')) throw new Error(`Refusing load test target ${host}`);
  if (__ENV.LOAD_TEST_AUTHORIZATION !== 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY') throw new Error('LOAD_TEST_AUTHORIZATION acknowledgement is required');
  return url.origin;
}

export function setup() {
  const origin = target();
  const response = http.get(`${origin}/health`, { tags: { route: 'health-preflight' }, timeout: '10s' });
  if (response.status !== 200) throw new Error(`Target preflight failed with ${response.status}`);
  const marker = response.json();
  if (marker.environment === 'production' || marker.loadTestAllowed === false) throw new Error('Target explicitly rejects load testing');
  return { origin };
}

export function schoolTraffic(data) {
  const schoolNumber = (exec.scenario.iterationInTest % Number(__ENV.LOAD_TEST_SCHOOLS || 1000)) + 1;
  const schoolId = `load-school-${String(schoolNumber).padStart(4, '0')}`;
  const headers = { 'X-Load-Test-School': schoolId, 'X-Load-Test-Run': __ENV.LOAD_TEST_RUN_ID || 'untracked' };
  const routes = ['/health', '/ready', '/api/platform/extensions?limit=20', '/api/platform/schools?limit=20'];
  const route = routes[exec.scenario.iterationInTest % routes.length];
  const response = http.get(`${data.origin}${route}`, { headers, tags: { route: route.replace(/\?.*/, ''), syntheticSchool: schoolId }, timeout: '10s' });
  check(response, { 'status is expected': (result) => [200, 401, 403].includes(result.status), 'response is bounded': (result) => result.body.length < 5_000_000 });
  sleep(Number(__ENV.LOAD_TEST_THINK_SECONDS || 0));
}

export function handleSummary(data) {
  const requests = data.metrics.http_reqs?.values?.count || 0;
  const receivedBytes = data.metrics.data_received?.values?.count || 0;
  const sentBytes = data.metrics.data_sent?.values?.count || 0;
  const durationMs = data.state?.testRunDurationMs || 0;
  const requestCost = requests / 1_000_000 * Number(__ENV.LOAD_COST_PER_MILLION_REQUESTS_USD || 0);
  const transferCost = (receivedBytes + sentBytes) / 1_000_000_000 * Number(__ENV.LOAD_COST_PER_GB_USD || 0);
  const environmentCost = durationMs / 3_600_000 * Number(__ENV.LOAD_ENVIRONMENT_COST_PER_HOUR_USD || 0);
  const report = { runId: __ENV.LOAD_TEST_RUN_ID || null, profile: profileName, target: __ENV.LOAD_TEST_TARGET, requests, receivedBytes, sentBytes, durationMs, estimatedCostUsd: Number((requestCost + transferCost + environmentCost).toFixed(4)), rates: { perMillionRequestsUsd: Number(__ENV.LOAD_COST_PER_MILLION_REQUESTS_USD || 0), perGbUsd: Number(__ENV.LOAD_COST_PER_GB_USD || 0), environmentPerHourUsd: Number(__ENV.LOAD_ENVIRONMENT_COST_PER_HOUR_USD || 0) } };
  return { stdout: `${JSON.stringify(report)}\n`, [`results/${__ENV.LOAD_TEST_RUN_ID || 'load-test'}-cost.json`]: JSON.stringify(report, null, 2) };
}
