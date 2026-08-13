import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { prepareRolloutEvidence } from '../governance/rollout-evidence';
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Usage: node prepare-rollout-evidence.js <rollout-input.json> <payload.json>');
const payload = prepareRolloutEvidence(JSON.parse(readFileSync(resolve(inputPath), 'utf8')));
writeFileSync(resolve(outputPath), `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outcome: 'PREPARED', waves: payload.waves.length, schools: payload.waves.at(-1)?.schoolCount })}\n`);
