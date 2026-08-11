# Service Deployment

Wattaman uses one versioned image with independently executed process roles.

## API

- Command: `node prisma/check-schema-compatibility.js && node dist/main`
- Stateless HTTP only; no cron scheduler registration.
- Scale horizontally behind the edge proxy.

## Operations Worker

- Command: `node dist/worker`
- Railway config: `backend/worker.railway.json`
- Registers scheduled cleanup, metrics rollup, extension update, and alert discovery.
- Exposes `/live` and `/ready` on `WORKER_HEALTH_PORT` (default `3002`); `/health` remains a liveness compatibility alias.
- Handles `SIGTERM`/`SIGINT`, stops accepting health traffic, and closes Nest providers before exit.
- Run exactly one scheduler worker until every schedule enqueues idempotent BullMQ work.

## Migration Runner

- Command: `node prisma/release-migrate.js`
- Runs as a pre-deploy release process with the migration database role.
- Never serves HTTP and never runs in API or worker startup.

API and worker processes receive `DATABASE_URL` for the RLS-enforced school-runtime identity and `CONTROL_PLANE_DATABASE_URL` for audited cross-school operations. The migration process receives only its migration identity. Queue-enabled processes additionally receive `REDIS_URL`.

The operations worker establishes an explicit unscoped control-plane context before Nest registers any schedules. Durable queue workers derive scoped or control-plane context from their validated job envelope before invoking handlers.

The API exposes `/live` without dependency access and `/ready` only after a successful database query. Deployment health checks use readiness; process supervisors may use liveness.
