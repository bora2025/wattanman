# Wattaman

Wattaman is an extension-first, multi-tenant school platform. The application core intentionally contains only tenant identity, authentication, users, settings, posts, audit, backup, domains, metrics, and the extension control/runtime plane. School features are installed as governed extensions rather than compiled into the core.

## Applications

- `backend/` — NestJS API, Prisma schema, migrations, tenant enforcement, platform control plane, and declarative extension runtime.
- `frontend/` — Next.js platform-admin and school-admin interfaces.
- `docs/` — architecture roadmap, implementation checklist, ADRs, security guidance, and extension operations.
- `examples/` — example extension packages used for validation and testing.

## Core Backend Boundaries

- `backend/src/auth/` — authentication, sessions, MFA, and school users.
- `backend/src/tenancy/` — exact hostname resolution, request tenant context, and platform-scope enforcement.
- `backend/src/platform/` — school provisioning, domains, publishers, marketplace releases, installations, billing, and extension operations.
- `backend/src/database/` — Prisma access and tenant-scoping enforcement.
- `backend/src/audit/`, `backup/`, `posts/`, `site-settings/`, `school-metrics/`, `storage/` — retained platform services.

## Core School Experience

A newly provisioned school receives no feature module automatically. Its base navigation is Overview, Search, Manage Users, Manage Extensions, Backup & Restore, Audit Logs, Settings, Appearance, and Posts. Additional school functionality must come from an approved extension installation.

## Development

```powershell
cd backend
npm install --legacy-peer-deps
npm run postinstall
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

Production database migrations are versioned under `backend/prisma/migrations/`. Never use `prisma db push` against production.

## Architecture

- Roadmap: `docs/platform-1000-schools-roadmap.md`
- Implementation status: `docs/platform-1000-schools-todo.md`
- Model inventory: `docs/core-model-inventory.md`
- Decisions: `docs/adr/`
