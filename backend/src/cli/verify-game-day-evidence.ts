import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyGameDayEvidence } from '../governance/game-day-evidence';
const [documentPath, registryPath] = process.argv.slice(2);
if (!documentPath || !registryPath) throw new Error('Usage: node verify-game-day-evidence.js <document.json> <trusted-reviewers.json>');
process.stdout.write(`${JSON.stringify(verifyGameDayEvidence(JSON.parse(readFileSync(resolve(documentPath), 'utf8')), JSON.parse(readFileSync(resolve(registryPath), 'utf8'))))}\n`);
