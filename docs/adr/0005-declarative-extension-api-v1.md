# ADR 0005: Declarative Extension API v1

- Status: Accepted
- Date: 2026-08-10

## Decision

Extension API v1 is declarative and capability-based. Packages declare navigation, pages, resources, schemas, permissions, dependencies, migrations, themes, and assets. They cannot execute arbitrary server code or access Prisma, filesystem, environment variables, network sockets, or another extension's records.

The platform validates signed immutable ZIP packages, enforces tenant scope, renders approved UI primitives, stores data in `ExtensionRecord`, applies quotas, and audits mutations. Runtime and manifest contracts are versioned independently from commercial type.

## Rollback

An installation can be disabled immediately, rolled back to a compatible signed version, and restored from migration backups. Emergency blocking overrides school activation.
