import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { prepareGameDayEvidence } from '../governance/game-day-evidence';
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Usage: node prepare-game-day-evidence.js <exercise-input.json> <payload.json>');
const payload = prepareGameDayEvidence(JSON.parse(readFileSync(resolve(inputPath), 'utf8')));
writeFileSync(resolve(outputPath), `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outcome: 'PREPARED', scenario: payload.scenario, rpoSeconds: payload.measurements.rpoSeconds, rtoSeconds: payload.measurements.rtoSeconds })}\n`);
