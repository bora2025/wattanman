import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyCertificationEvidence } from '../load-test/certification-evidence';

const path = process.argv[2];
if (!path) throw new Error('Usage: npm run load:verify -- <evidence.json>');
const evidence = JSON.parse(readFileSync(resolve(path), 'utf8'));
process.stdout.write(`${JSON.stringify(verifyCertificationEvidence(evidence))}\n`);
