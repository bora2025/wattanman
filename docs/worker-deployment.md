# Worker Deployment

Deploy four independent stateless services from the backend build artifact:

| Service | Command | Default health port | Responsibility |
| --- | --- | --- | --- |
| API | `npm run start:prod` | `PORT` | HTTP requests only; no scheduler |
| Operations worker | `npm run start:worker` | `3002` | Audit retention, metrics rollups, queue monitoring |
| Extension worker | `npm run start:extension-worker` | `3003` | Extension cleanup, updates, alerts, and extension queue jobs |
| Notification worker | `npm run start:notification-worker` | `3004` | Email and SMS queue jobs |

Each worker exposes `/live`, `/health`, and `/ready`, handles `SIGTERM`/`SIGINT`,
and closes BullMQ workers and Redis clients before exit. Set a distinct
`WORKER_HEALTH_PORT` per service when services share a host. Production requires
TLS Redis through `REDIS_URL=rediss://...`.

Durable jobs carry a validated versioned envelope. `QueueInfrastructureService`
establishes `tenantContext` from that envelope for every execution; scoped jobs
must identify their school and platform jobs explicitly use the platform scope.
Unknown job types fail and follow the standard retry/dead-letter policy rather
than being silently acknowledged.

The API and frontend keep no durable server-local state. Browser `localStorage`
is limited to client preferences and session presentation; authoritative state
is PostgreSQL, Redis, or R2. The API's domain map is a replaceable derived cache,
refreshed from PostgreSQL and safe to lose between replicas.

Rollback can scale either dedicated worker to zero and redeploy the preceding
worker image. Do not run the old combined scheduler concurrently: role guards
prevent cross-role schedules, but duplicate replicas still require BullMQ jobs
or distributed leases for exactly-once side effects.
