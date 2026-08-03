# Extension Compromise Response Runbook

## Trigger

Use this runbook for malicious package content, leaked publisher credentials, unexpected capability use, integrity mismatch, or repeated extension failures.

## Immediate containment

1. Record the extension key, version, checksum, reporter, timestamps, and observed indicators in the incident ticket.
2. In Platform → Extensions, use **Emergency block** on every affected version. Blocking immediately disables installations that use that version without redeploying Wattaman.
3. If publisher credentials or multiple packages may be affected, suspend or revoke the publisher. This unlists its catalog and disables its active installations.
4. Do not delete package objects, validation reports, versions, audit logs, or installation rows. They are incident evidence.
5. Confirm the health dashboard reports zero active installations for each blocked version and export the affected-school list for communications.

## Investigation

1. Verify the published ZIP SHA-256 against `ExtensionVersion.packageChecksum` and its checksum-addressed R2 key.
2. Review package validation errors and warnings, uploader/reviewer identities, review notes, publication time, and lifecycle audit entries.
3. Compare requested permissions with the prior trusted version and inspect extension-record access patterns in audit and application logs.
4. Rotate R2 credentials if storage access may be compromised. Revoke publisher signing credentials when package signing is enabled.
5. Preserve relevant logs and package artifacts under the organization's incident-retention policy.

## Recovery

1. Publish a new immutable version; never replace or mutate the blocked artifact.
2. Validate, review permission changes, and test the replacement in a non-production school.
3. Upgrade affected schools to the replacement or roll back to a non-blocked published/deprecated version.
4. Reactivate installations only after the incident owner approves recovery.
5. Reactivate a suspended publisher only when its credentials and release process are trusted again. Revoked publishers require a new identity.

## Closure

Document root cause, affected schools, data impact, actions, timestamps, and follow-up controls. Confirm audit history contains block, publisher status, upgrade/rollback, and reactivation events. Add regression tests for the failure mode before closing the incident.
