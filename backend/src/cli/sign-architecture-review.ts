import { createPrivateKey, sign } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { approvalSigningPayload } from '../governance/architecture-review';

const payloadPath = process.argv[2];
const reviewerId = process.argv[3];
const role = process.argv[4];
const outputPath = process.argv[5];
if (!payloadPath || !reviewerId || !role || !outputPath) throw new Error('Usage: node sign-architecture-review.js <payload.json> <reviewer-id> <role> <approval.json>');
if (!/^[a-zA-Z0-9._-]{3,100}$/.test(reviewerId) || !['ARCHITECTURE_OWNER', 'SECURITY_OWNER'].includes(role)) throw new Error('Reviewer identity or role is invalid');
const key = createPrivateKey(process.env.ARCHITECTURE_REVIEW_PRIVATE_KEY_PEM || '');
if (key.asymmetricKeyType !== 'ed25519') throw new Error('Architecture review private key must be Ed25519');
const payload = JSON.parse(readFileSync(resolve(payloadPath), 'utf8'));
const approval = { reviewerId, role, signedAt: new Date().toISOString(), signature: '' };
approval.signature = sign(null, approvalSigningPayload(payload, approval), key).toString('base64');
writeFileSync(resolve(outputPath), `${JSON.stringify(approval, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outcome: 'SIGNED', reviewerId, role, commit: payload.commit })}\n`);
