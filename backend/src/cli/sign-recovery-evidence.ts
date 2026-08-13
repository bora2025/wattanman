import { createPrivateKey, sign } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { recoveryApprovalPayload } from '../governance/recovery-evidence';

const [payloadPath, reviewerId, role, outputPath] = process.argv.slice(2);
if (!payloadPath || !reviewerId || !role || !outputPath) throw new Error('Usage: node sign-recovery-evidence.js <payload.json> <reviewer-id> <role> <approval.json>');
if (!/^[a-zA-Z0-9._-]{3,100}$/.test(reviewerId) || !['INFRASTRUCTURE_OWNER', 'RELIABILITY_OWNER'].includes(role)) throw new Error('Recovery reviewer identity or role is invalid');
const key = createPrivateKey(process.env.RECOVERY_EVIDENCE_PRIVATE_KEY_PEM || '');
if (key.asymmetricKeyType !== 'ed25519') throw new Error('Recovery evidence private key must be Ed25519');
const payload = JSON.parse(readFileSync(resolve(payloadPath), 'utf8'));
const approval = { reviewerId, role, signedAt: new Date().toISOString(), signature: '' };
approval.signature = sign(null, recoveryApprovalPayload(payload, approval), key).toString('base64');
writeFileSync(resolve(outputPath), `${JSON.stringify(approval, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outcome: 'SIGNED', reviewerId, role })}\n`);
