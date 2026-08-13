import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { ChaosAction, readChaosScenario, runChaosAction } from '../load-test/chaos-control-driver';

const scenarioPath = process.argv[2];
const action = process.argv[3] as ChaosAction;
const outputPath = process.argv[4];
if (!scenarioPath || !action || !outputPath) throw new Error('Usage: node run-load-chaos-action.js <scenario.json> <inject|recover|verify> <evidence.json>');

runChaosAction({ scenario: readChaosScenario(scenarioPath), action, controlUrl: process.env.LOAD_CHAOS_CONTROL_URL || '', secret: process.env.LOAD_CHAOS_CONTROL_SECRET || '', runId: process.env.LOAD_TEST_RUN_ID || '' })
  .then((evidence) => {
    const output = resolve(outputPath);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ outcome: 'PASSED', scenario: evidence.scenario, action: evidence.action, terminalStatus: evidence.terminalStatus })}\n`);
  })
  .catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
