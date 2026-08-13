import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { ApiPhase, runApiPhase } from '../load-test/api-phase-driver';

const phasePath = process.argv[2];
const outputPath = process.argv[3];
if (!phasePath || !outputPath) throw new Error('Usage: node run-load-api-phase.js <phase.json> <evidence.json>');
const phase = JSON.parse(readFileSync(resolve(phasePath), 'utf8')) as ApiPhase;
runApiPhase(phase, process.env.LOAD_TEST_TARGET || '')
  .then((evidence) => { writeFileSync(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); process.stdout.write(`${JSON.stringify({ outcome: 'PASSED', phase: evidence.phase, steps: evidence.steps.length })}\n`); })
  .catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
