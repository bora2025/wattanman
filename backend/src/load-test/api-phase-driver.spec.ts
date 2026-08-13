import { createServer, Server } from 'http';
import { runApiPhase, ApiPhase } from './api-phase-driver';

describe('API phase driver', () => {
  let server: Server;
  let target: string;
  const previous = { ...process.env };

  beforeEach(async () => {
    process.env.LOAD_TEST_AUTHORIZATION = 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY';
    process.env.LOAD_TEST_OPERATOR_TOKEN = 'secret-bearer';
    let polls = 0;
    server = createServer((request, response) => {
      expect(request.headers.authorization).toBe('Bearer secret-bearer');
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/versions' && request.method === 'POST') return response.end(JSON.stringify({ id: 'version-1' }));
      if (request.url === '/versions/version-1' && request.method === 'GET') return response.end(JSON.stringify({ status: ++polls > 1 ? 'PASSED' : 'RUNNING', id: 'version-1' }));
      response.statusCode = 404;
      response.end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    target = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    process.env = { ...previous };
  });

  it('captures response values, interpolates them, polls, and redacts evidence', async () => {
    const phase: ApiPhase = { schemaVersion: 1, name: 'validation', fixtureRoot: '.', steps: [
      { name: 'create', method: 'POST', path: '/versions', tokenEnv: 'LOAD_TEST_OPERATOR_TOKEN', json: { release: 'test' }, expectedStatuses: [200], capture: { STEP_VERSION_ID: 'id' } },
      { name: 'poll', method: 'GET', path: '/versions/${STEP_VERSION_ID}', tokenEnv: 'LOAD_TEST_OPERATOR_TOKEN', expectedStatuses: [200], poll: { path: 'status', values: ['PASSED'], intervalMs: 100, timeoutMs: 2000 } },
    ] };
    const evidence = await runApiPhase(phase, target);
    const serialized = JSON.stringify(evidence);
    expect(evidence.steps[1].terminalValue).toBe('PASSED');
    expect(serialized).not.toContain('secret-bearer');
    expect(serialized).not.toContain('version-1');
    expect(serialized).toContain('STEP_VERSION_ID');
  });

  it('rejects production targets', async () => {
    await expect(runApiPhase({ schemaVersion: 1, name: 'x', fixtureRoot: '.', steps: [{ name: 'x', method: 'GET', path: '/', tokenEnv: 'LOAD_TEST_OPERATOR_TOKEN', expectedStatuses: [200] }] }, 'https://wattanman.app')).rejects.toThrow('Production HTTP target');
  });

  it('rejects multipart fixture escape', async () => {
    await expect(runApiPhase({ schemaVersion: 1, name: 'x', fixtureRoot: '.', steps: [{ name: 'x', method: 'POST', path: '/', tokenEnv: 'LOAD_TEST_OPERATOR_TOKEN', expectedStatuses: [200], multipart: { fileField: 'file', filePath: '../secret.zip', contentType: 'application/zip' } }] }, target)).rejects.toThrow('escapes fixtureRoot');
  });
});
