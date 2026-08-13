# Stage 3 Package Security Review

**Date:** 2026-08-13  
**Scope:** Internal declarative modules and themes only. Executable and external-publisher launch remains excluded.

## Decision

Approved for the Stage 3 internal marketplace boundary described in
`docs/extension-threat-model.md`. This approval does not authorize executable
extensions or public third-party publishing.

## Verified controls

- ZIP parsing runs in a bounded worker and extracts no files to disk.
- Absolute, traversal, duplicate, deep, long, control-character, and symlink paths are rejected.
- Entry count, file count, compressed input, per-file expansion, aggregate expansion, and compression ratio are bounded.
- Executable and unsupported extensions, MIME spoofing, unsafe Markdown, unsafe CSS, and unknown manifest properties are rejected.
- Original bytes remain in private quarantine until validation, review, immutable checksum addressing, and Ed25519 signing complete.
- Installation and runtime verify package checksum, signature, lifecycle state, publisher state, and key revocation.
- Tenant scope, publisher permissions, idempotency, distributed command locks, durable jobs, audit events, retention, and signed purge evidence are enforced.

## Verification evidence

- Malicious-package tests cover traversal, excessive entries, symlinks, ZIP bombs, oversized expansion, executable files, invalid MIME signatures, unsafe CSS, and unsafe Markdown.
- Signing tests cover tampered bytes, revoked keys, publication preconditions, key rotation, and affected-installation blocking.
- Lifecycle tests prove duplicate command replay and completed-job replay do not repeat installation work.
- Marketplace tests prove tenant-authoritative request creation and platform-admin visibility of `REQUESTED` installations.

## Residual conditions

- External publishers require disposable container validation and malware-scanning controls before launch.
- Executable extensions remain denied and require a separate threat-model revision and security approval.
- Production database-copy rehearsal and cross-school load/security sign-off remain later roadmap gates.
