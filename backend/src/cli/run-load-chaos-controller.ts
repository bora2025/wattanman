import { createServer } from 'http';
import { resolve } from 'path';
import { readdirSync } from 'fs';
import { ChaosController, RedisChaosOperationStore } from '../load-test/chaos-controller';
import { readChaosScenario } from '../load-test/chaos-control-driver';

if (process.env.LOAD_CHAOS_CONTROLLER_AUTHORIZATION !== 'I_AUTHORIZE_ISOLATED_CHAOS_CONTROL') throw new Error('LOAD_CHAOS_CONTROLLER_AUTHORIZATION is required');
if (process.env.LOAD_CHAOS_ENVIRONMENT !== 'ISOLATED_PERFORMANCE') throw new Error('LOAD_CHAOS_ENVIRONMENT must be ISOLATED_PERFORMANCE');
const scenarioRoot = resolve(process.env.LOAD_CHAOS_SCENARIO_ROOT || 'load-test/chaos-scenarios');
const scenarios = new Map(readdirSync(scenarioRoot).filter((name) => name.endsWith('.json')).map((name) => { const scenario = readChaosScenario(resolve(scenarioRoot, name)); return [scenario.name, scenario]; }));
const store = new RedisChaosOperationStore(process.env.LOAD_CHAOS_REDIS_URL || '');
const adapterUrls = Object.fromEntries([...scenarios.keys()].map((name) => [name, process.env[`LOAD_CHAOS_ADAPTER_${name.replace(/-/g, '_').toUpperCase()}_URL`] || '']));
const controller = new ChaosController(store, scenarios, process.env.LOAD_CHAOS_CONTROL_SECRET || '', process.env.LOAD_CHAOS_ADAPTER_SECRET || '', adapterUrls);

function send(response: any, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(`${JSON.stringify(value)}\n`);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return send(response, 200, { status: 'ok', environment: 'ISOLATED_PERFORMANCE' });
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 32 * 1024) throw new Error('Chaos request body exceeds 32 KB'); chunks.push(chunk); }
    const body = Buffer.concat(chunks).toString('utf8');
    const auth = { timestamp: request.headers['x-chaos-timestamp'] as string, nonce: request.headers['x-chaos-nonce'] as string, signature: request.headers['x-chaos-signature'] as string };
    if (request.method === 'POST' && request.url === '/v1/chaos/operations') {
      await controller.authenticate({ ...auth, content: body });
      return send(response, 202, await controller.accept(JSON.parse(body)));
    }
    const match = request.method === 'GET' && request.url?.match(/^\/v1\/chaos\/operations\/([a-zA-Z0-9._-]{1,200})$/);
    if (match) {
      await controller.authenticate({ ...auth, content: request.url! });
      const operation = await controller.operation(match[1]);
      return operation ? send(response, 200, operation) : send(response, 404, { error: 'Not found' });
    }
    return send(response, 404, { error: 'Not found' });
  } catch (error: any) { return send(response, 400, { error: String(error?.message || error).slice(0, 200) }); }
});

const port = Number(process.env.LOAD_CHAOS_PORT || 8787);
const bind = process.env.LOAD_CHAOS_BIND || '127.0.0.1';
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LOAD_CHAOS_PORT is invalid');
server.listen(port, bind, () => process.stdout.write(`${JSON.stringify({ event: 'chaos_controller_ready', bind, port, scenarios: scenarios.size })}\n`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => store.close().finally(() => process.exit(0))));
