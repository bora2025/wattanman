import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyRehearsalReport } from '../database/destructive-migration-rehearsal';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: node verify-destructive-migration-rehearsal.js <signed-report.json>');
const report = JSON.parse(readFileSync(resolve(reportPath), 'utf8'));
process.stdout.write(`${JSON.stringify(verifyRehearsalReport(report, process.env.DESTRUCTIVE_REHEARSAL_SIGNING_PUBLIC_KEY_PEM || ''))}\n`);
