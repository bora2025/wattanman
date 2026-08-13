# Signing-key compromise runbook

**Owner:** Security Owner. Treat confirmed private-key disclosure as SEV-1.

## Identify the trust domain

- **Publisher Ed25519 key:** signs extension packages; public keys live in the publisher registry.
- **Platform extension-signing key:** signs platform-owned release artifacts.
- **Operational report key:** signs purge or school-deletion evidence.
- **JWT/session, database, Redis, R2, or webhook secret:** not a signing key; use the relevant dependency/security rotation procedure.

Never paste private key PEM/base64 into chat, tickets, logs, source control, browser prompts, or database fields.

## Containment

1. Record key ID, trust domain, first/last possible exposure, discoverer, and evidence location without recording key material.
2. Publisher key: revoke it in Platform → Extensions. Revocation irreversibly blocks versions signed by that key and disables their active installations. Emergency-block all possibly affected versions and suspend the publisher if scope is unclear.
3. Platform release key: stop publication and deployment promotion; block artifacts signed during the exposure window.
4. Operational report key: stop destructive purge/deletion operations before rotation so no unverifiable evidence is issued.
5. Preserve registry history, immutable packages/reports, checksums, audit logs, environment-change history, and deployment IDs.

## Rotation and recovery

1. Generate Ed25519 keys offline with an approved secret-management workstation. Register/distribute only the public key; store private key base64 only in Railway service variables or the approved secret manager.
2. Assign a new unique key ID. Never overwrite an old public key under the same ID.
3. Deploy producers with the new private key, verify signatures against the independently distributed public key, then revoke/remove old private material from every service and operator device.
4. Rebuild and republish trusted extension versions as new immutable versions. Upgrade or roll back affected schools before removing emergency blocks.
5. For report keys, retain old public keys indefinitely so historical reports remain verifiable; document the key validity interval.

## Verification and closure

Prove the old key cannot publish/sign, the new key verifies, affected versions remain blocked until replaced, and historical signatures still verify. Search secret-scanning and logs for exposure, rotate adjacent credentials when provenance is uncertain, notify affected schools by opaque incident scope, and record timeline/root cause/follow-ups.
