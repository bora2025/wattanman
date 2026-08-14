# Staging environment

Railway environment `staging` (`10d6ad65-2920-4832-b1de-ea8d95411bce`) was created on 2026-08-14 as an isolated
duplicate of production configuration. Its PostgreSQL and Redis services use new empty environment-scoped volumes.
A bounded database verification found zero schools, users, and extensions after all 51 migrations applied.

## Endpoints

- API: `https://wattanman-staging.up.railway.app`
- Frontend: `https://resourceful-miracle-staging.up.railway.app`

The API `/ready` endpoint returned `ready`, the frontend returned HTTP 200, and the following sanitized deployments
succeeded:

- API `9ebb5833-5fde-4787-88c6-4edabc4ca038`
- Frontend `95b56dbe-9128-4bfe-a42a-7ff172a5d625`
- Extension worker `0aa7f3cd-8bde-4ab3-9e3e-6f451f9d36e7`
- PostgreSQL `177b1262-a69c-45cc-a4c6-8851d9402b3d`
- Redis `0252de3e-fedc-4ae7-b0ca-50dc41ea8576`
- ClamAV `3e2efb45-03cb-4aa8-b53b-c85a9d3cf2cf`

## Isolation controls

- The API runs one Southeast Asia replica.
- JWT and extension-signing private keys are staging-specific.
- Database and Redis references resolve inside the staging environment.
- Production R2, Railway API, and Twilio credentials were replaced with fail-closed staging placeholders.
- Browser origins and platform/API hosts point only to staging endpoints.
- Staging R2 operations remain intentionally unavailable until a separate least-privilege staging bucket credential is
  configured.

Do not sync production variable values or data into staging. Future environment synchronization must review every
secret, service reference, public domain, replica count, and external integration before deployment.
