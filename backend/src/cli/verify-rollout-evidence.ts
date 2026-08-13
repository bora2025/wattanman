import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyRolloutEvidence } from '../governance/rollout-evidence';
const [documentPath, registryPath] = process.argv.slice(2);
if (!documentPath || !registryPath) throw new Error('Usage: node verify-rollout-evidence.js <document.json> <trusted-reviewers.json>');
process.stdout.write(`${JSON.stringify(verifyRolloutEvidence(JSON.parse(readFileSync(resolve(documentPath), 'utf8')), JSON.parse(readFileSync(resolve(registryPath), 'utf8'))))}\n`);
