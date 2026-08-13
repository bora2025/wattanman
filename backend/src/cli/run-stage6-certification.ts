import { readCertificationManifest, runCertificationManifest } from '../load-test/certification-orchestrator';

const path = process.argv[2];
if (!path) throw new Error('Usage: npm run load:run -- <manifest.json>');
runCertificationManifest(readCertificationManifest(path))
  .then((result) => process.stdout.write(`${JSON.stringify({ outcome: 'EXECUTED', runId: result.runId, completedAt: result.completedAt })}\n`))
  .catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
