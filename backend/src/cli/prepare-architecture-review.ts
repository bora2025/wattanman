import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { prepareArchitectureReview } from '../governance/architecture-review';

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) throw new Error('Usage: node prepare-architecture-review.js <review-input.json> <payload.json>');
const root = resolve(process.cwd(), '..');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const payload = prepareArchitectureReview(root, JSON.parse(readFileSync(resolve(inputPath), 'utf8')), commit);
writeFileSync(resolve(outputPath), `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outcome: 'PREPARED', commit, artifacts: payload.artifacts.length })}\n`);
