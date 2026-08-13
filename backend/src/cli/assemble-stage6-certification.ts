import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { assembleCertificationEvidence } from '../load-test/certification-evidence-assembler';

const resultsDirectory = process.argv[2];
const approvalPath = process.argv[3];
const outputPath = process.argv[4];
if (!resultsDirectory || !approvalPath || !outputPath) throw new Error('Usage: node assemble-stage6-certification.js <results-directory> <signed-approval.json> <evidence.json>');
const result = assembleCertificationEvidence(resultsDirectory, approvalPath, process.env.LOAD_CERTIFICATION_APPROVAL_PUBLIC_KEY_PEM || '');
const output = resolve(outputPath);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result.evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify(result.verification)}\n`);
