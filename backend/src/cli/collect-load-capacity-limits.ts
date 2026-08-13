import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { collectCapacityLimits } from '../load-test/capacity-limit-collector';

const output = resolve(process.argv[2] || 'load-test/results/capacity-limits.json');
const samples = Number(process.env.LOAD_LIMIT_SAMPLES || 60);
const intervalMs = Number(process.env.LOAD_LIMIT_INTERVAL_MS || 10_000);

collectCapacityLimits({ target: process.env.LOAD_TEST_TARGET || '', token: process.env.LOAD_TEST_OPERATOR_TOKEN || '', samples, intervalMs })
  .then((evidence) => {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ outcome: 'PASSED', samples: evidence.sampleCount, limits: evidence.limits })}\n`);
  })
  .catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
