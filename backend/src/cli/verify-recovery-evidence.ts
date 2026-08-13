import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyRecoveryEvidence } from '../governance/recovery-evidence';

const documentPath = process.argv[2];
const registryPath = process.argv[3];
if (!documentPath || !registryPath) throw new Error('Usage: node verify-recovery-evidence.js <evidence-document.json> <trusted-reviewers.json>');
const document = JSON.parse(readFileSync(resolve(documentPath), 'utf8'));
const registry = JSON.parse(readFileSync(resolve(registryPath), 'utf8'));
process.stdout.write(`${JSON.stringify(verifyRecoveryEvidence(document, registry))}\n`);
