import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { prepareRecoveryEvidence } from '../governance/recovery-evidence';

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) throw new Error('Usage: node prepare-recovery-evidence.js <provider-input.json> <payload.json>');
const payload = prepareRecoveryEvidence(JSON.parse(readFileSync(resolve(inputPath), 'utf8')));
writeFileSync(resolve(outputPath), `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outcome: 'PREPARED', provider: payload.provider, rpoSeconds: payload.rehearsal.rpoSeconds, rtoSeconds: payload.rehearsal.rtoSeconds })}\n`);
