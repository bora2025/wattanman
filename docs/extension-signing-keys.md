# Extension Package Signing Keys

Wattaman signs published theme and declarative-module ZIPs with Ed25519. PostgreSQL stores public keys only. The active PKCS8 private key remains in the deployment secret store as base64-encoded PEM.

## Generate a key pair

```bash
openssl genpkey -algorithm Ed25519 -out wattaman-extension-private.pem
openssl pkey -in wattaman-extension-private.pem -pubout -out wattaman-extension-public.pem
```

Register the public PEM in Platform → Extensions → Publishers. Set its key ID in `EXTENSION_SIGNING_KEY_ID`, and set the base64-encoded private PEM in `EXTENSION_SIGNING_PRIVATE_KEY_BASE64`. Never upload, commit, log, or store the private PEM in PostgreSQL.

## Rotation

1. Generate a new key pair and register its public key with a new unique key ID.
2. Update both signing environment variables atomically and restart the backend.
3. Publish a test package and verify the version references the new key.
4. Mark the old key `RETIRED`. Retired keys remain valid for existing signatures but cannot sign new releases.
5. Retain old private material only according to the organization's secured recovery policy; verification needs only the public key.

## Revocation

Use `REVOKED` only for compromise or loss of trust. Revocation is irreversible. Wattaman immediately blocks published/deprecated versions signed by that key and disables their active installations. Follow `docs/extension-incident-runbook.md`, publish replacements with a new key, and upgrade or roll back affected schools before reactivation.
