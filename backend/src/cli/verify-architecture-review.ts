import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyArchitectureReview } from '../governance/architecture-review';

const documentPath = process.argv[2];
const registryPath = process.argv[3];
if (!documentPath || !registryPath) throw new Error('Usage: node verify-architecture-review.js <review-document.json> <trusted-reviewers.json>');
const root = resolve(process.cwd(), '..');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const document = JSON.parse(readFileSync(resolve(documentPath), 'utf8'));
const registry = JSON.parse(readFileSync(resolve(registryPath), 'utf8'));
process.stdout.write(`${JSON.stringify(verifyArchitectureReview(document, registry, root, commit))}\n`);
