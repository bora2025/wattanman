# School Bus Module — Product, Architecture, UX, and Delivery Plan

Status: Planning only — implementation has not started.

## 1. Objective

Turn the existing School Bus module into a complete, tenant-safe transport
system for administrators, dispatchers, drivers, parents, and students. The
finished module must support fleet management, drivers, routes and stops,
student assignments, scheduled trips, live bus motion, boarding events,
notifications, incidents, maintenance, reporting, and auditable operations.

## 2. Current-State Audit

### Existing backend

- `Bus`, `BusRoute`, `BusStop`, and `BusLocation` Prisma models exist.
- Bus, route, stop, latest-location, and location-history endpoints exist.
- HTTP endpoints are guarded by JWT, roles, tenant middleware, and the `BUS`
  module entitlement.
- A Socket.IO `/bus` namespace accepts subscriptions and location updates.

### Existing frontend

- `/admin/bus` lists buses and routes and can create/delete basic records.
- `/parent/bus` lists every school bus and polls its latest location.
- Leaflet renders one marker over public OpenStreetMap raster tiles.
- Links advertise `/admin/bus/map` and `/admin/bus/live/:id`, but those routes
  do not exist.

### Material gaps and risks

- `driverId` is an unvalidated string, not a relation to a school user.
- There are no transport assignments linking students/parents to a bus, route,
  stop, or trip; parents can currently discover every bus in their school.
- There are no schedules, trip instances, direction, ETA, attendance,
  boarding/alighting, capacity, incident, maintenance, or substitute-driver
  workflows.
- Route stops cannot be edited/reordered in the existing UI.
- Request bodies use `any`; coordinates, speed, heading, status, capacity, and
  cross-record ownership are not DTO-validated.
- WebSocket connection, subscription, and location-write paths do not verify
  JWT, tenant, role, entitlement, bus assignment, or room authorization.
- Socket CORS is `*`, and room names are not tenant-qualified.
- Browser location publishing has no driver-specific identity, trip session,
  replay protection, rate limit, idempotency, or stale/outlier filtering.
- Polling causes marker jumps; there is no smooth interpolation, route line,
  next stop, ETA, geofence, connection status, or stale-location state.
- Public `tile.openstreetmap.org` has no SLA and can block inappropriate or
  heavy production usage; the tile URL is hard-coded.
- No focused bus tests, tenant-isolation E2E, location-ingestion load test, or
  map visual regression suite currently exists.

## 3. Recommended Product Boundary

### Initial production delivery

Keep School Bus as a compiled Wattaman module protected by the existing `BUS`
entitlement. Live GPS, authenticated sockets, geofencing, notification jobs,
and map rendering need trusted backend/frontend code and are not supported by
the current declarative ZIP runtime.

### Extension-platform test package

Create a separate declarative `BUS_OPERATIONS_DEMO` ZIP only after the compiled
module is stable. It may demonstrate approved navigation, stats, forms, tables,
and tenant records, but it must not claim to implement live GPS or execute code.
Possible demo resources: vehicle inspection forms, fuel logs, maintenance
requests, and incident records.

### Future extension option

If uploaded packages must own live transport behavior, first approve one of:

1. trusted platform-owned declarative capabilities for map, geolocation,
   trip-stream subscription, and transport notifications; or
2. Stage 5 isolated executable extensions with separate services, scoped
   identities, no primary-database credentials, and revocable capabilities.

This architecture decision is required before packaging the complete bus
product as an uploaded extension.

## 4. Recommended V1 Roles

| Role | Responsibilities |
|---|---|
| School admin | Configure fleet, drivers, routes, stops, assignments, schedules, policies, and reports |
| Dispatcher | Start/monitor trips, assign substitutes, handle delays/incidents, contact drivers |
| Driver | View assigned trip, perform pre-trip check, start/end trip, publish GPS, scan boarding, report incident |
| Bus assistant | Scan boarding/alighting and confirm student handoff; no vehicle configuration |
| Parent | See only linked children, assigned stop/trip, live bus, ETA, boarding status, and alerts |
| Student | See own route/stop/ETA where school policy permits |
| Platform admin | Enable/disable module and view aggregate operational health, not routine tenant trip data |

Recommended implementation maps dispatcher and assistant to explicit transport
permissions rather than overloading existing broad roles.

## 5. Core Workflows

### Fleet onboarding

1. Admin creates a vehicle with plate, capacity, make/model, year, color,
   accessibility, GPS device identifier, documents, and status.
2. Admin assigns a qualified driver and optional assistant.
3. System validates same-school ownership, capacity, active staff status, and
   duplicate plate/device identifiers.
4. Vehicle becomes dispatchable only when mandatory checks are complete.

### Route design

1. Admin creates an inbound or outbound route.
2. Admin adds stops by map click, search, or coordinates.
3. Stops can be dragged to reorder and edited with pickup/drop-off windows,
   dwell time, geofence radius, and parent instructions.
4. System draws route geometry, calculates distance/duration, and highlights
   unreachable or duplicated stops.
5. A published route version is immutable for active trips; edits create a new
   version effective on a selected date.

### Student assignment

1. Admin selects students individually, by class, or by CSV.
2. Each assignment chooses morning/evening route, pickup/drop-off stop,
   effective dates, handoff rules, emergency contacts, and accessibility needs.
3. Capacity conflicts and unlinked parents are shown before save.
4. Parents see only buses/trips serving their linked children.

### Daily dispatch

1. Scheduled trip instances are generated for active school days, excluding
   holidays and route exceptions.
2. Driver completes a pre-trip checklist.
3. Dispatcher confirms vehicle, driver, assistant, and substitutions.
4. Driver starts the trip; only then can the assigned device publish location.
5. Trip progresses through `SCHEDULED`, `BOARDING`, `IN_PROGRESS`, `DELAYED`,
   `COMPLETED`, or `CANCELLED`.

### Live tracking

1. Driver device obtains explicit geolocation permission over HTTPS.
2. Device sends sequenced location samples tied to one authenticated trip
   session, including accuracy, speed, heading, device timestamp, and battery
   where available.
3. Backend validates assignment, tenant, trip state, coordinate ranges,
   freshness, sequence, speed/outlier rules, and rate limits.
4. Backend stores sampled history and broadcasts authorized updates.
5. Clients smoothly interpolate between accepted points, rotate the bus marker,
   show route progress, next stop, ETA, connection quality, and stale status.

### Boarding and handoff

1. Driver/assistant scans the existing student QR card or selects a roster row.
2. Server verifies the student is assigned to the active trip.
3. Event records `BOARDED`, `ALIGHTED`, `ABSENT`, `WRONG_STOP`, or
   `HANDED_TO_GUARDIAN` with timestamp, stop, actor, and optional GPS.
4. Parent receives idempotent event notifications.
5. Trip cannot silently complete with unresolved boarded students.

### Delay, incident, and emergency

1. Driver or dispatcher records delay reason, expected duration, or incident.
2. Affected parents receive targeted notifications.
3. Emergency mode highlights contact actions and precise last-known location,
   but never exposes it outside authorized tenant users.
4. Every state change and privileged read is audited.

## 6. Proposed Data Model

### Refactor existing models

- `Bus`: relational `driverId`, optional assistant, vehicle metadata, GPS device,
  status reason, service dates, and optimistic version.
- `BusRoute`: status, direction, timezone, active dates, version, encoded route
  geometry, distance, duration, and source provider.
- `BusStop`: stable stop identity plus route-version ordering, time window,
  dwell time, geofence radius, and instructions.
- `BusLocation`: trip ID, device ID, accuracy, altitude, sequence, received time,
  source, acceptance status, and rejection reason.

### New models

- `BusDriverAssignment`: vehicle, driver, assistant, effective range.
- `BusRouteVersion`: immutable published route snapshots.
- `BusSchedule`: weekdays, direction, departure, effective dates.
- `BusTrip`: one operational run with assigned vehicle/staff and lifecycle.
- `BusTripStop`: planned/estimated/actual arrival and departure per stop.
- `BusStudentAssignment`: student, route/stop by direction, dates, handoff policy.
- `BusTripStudent`: trip roster snapshot and latest transport status.
- `BusBoardingEvent`: append-only boarding/alighting/handoff event.
- `BusDriverSession`: revocable trip-scoped device session and sequence state.
- `BusInspection`: pre/post-trip checklist and defects.
- `BusIncident`: severity, category, notes, attachments, location, resolution.
- `BusMaintenance`: service type, odometer, dates, cost, status, documents.
- `BusNotificationEvent`: idempotency and delivery state for transport alerts.

Every tenant-owned model includes `schoolId`, same-school foreign-key checks at
the service boundary, useful compound indexes, and explicit retention rules.

## 7. API and Realtime Design

### Admin and dispatcher REST areas

- `/bus/vehicles`
- `/bus/drivers`
- `/bus/routes` and `/bus/routes/:id/versions`
- `/bus/stops`
- `/bus/assignments`
- `/bus/schedules`
- `/bus/trips`
- `/bus/trips/:id/dispatch`
- `/bus/incidents`
- `/bus/maintenance`
- `/bus/reports`

Use DTO classes with `class-validator`; never accept `any`. Mutations support
idempotency keys and return structured conflict/validation errors.

### Driver APIs

- obtain/revoke a trip-scoped driver session;
- fetch today's assigned trips and roster;
- start/pause/resume/end trip;
- submit batched location samples;
- record inspection, boarding, delay, and incident events.

### Parent/student APIs

- return only child/self transport assignments and active trip summaries;
- expose generalized route/stop data only when authorized;
- never return the full fleet or unrelated student roster.

### WebSocket security

- Authenticate the Socket.IO handshake with the normal JWT.
- Resolve and verify tenant host/JWT school before opening rooms.
- Use rooms such as `school:{schoolId}:trip:{tripId}`.
- Authorize every subscription from trip/child/role relationships.
- Permit location publishing only from an active driver session assigned to the
  exact trip and vehicle.
- Apply entitlement checks, payload validation, rate limits, message-size
  limits, sequence replay protection, and disconnect/revocation handling.
- Restrict CORS to configured frontend origins.

## 8. Map and Motion Architecture

### Renderer

Recommended: migrate the bus surfaces to MapLibre GL JS with a configurable
vector-tile/style provider. MapLibre supports realtime GeoJSON, marker rotation,
route layers, camera easing, and smooth animation. Leaflet can remain for the
first increment if schedule risk is more important than visual motion.

### Tile/routing provider decision

Do not depend on the hard-coded public OSM raster endpoint for production. OSM
states that its community tile servers are best-effort, have no SLA, prohibit
bulk/offline use, and may block abusive or unsuitable usage. Select one provider
with explicit production terms, Cambodia coverage, attribution, quotas, and a
cost alert, or self-host tiles/routing.

Required environment abstraction:

- map style/tile URL;
- public client token where applicable;
- routing/geocoding server URL and server-side secret;
- attribution text;
- provider request timeout and quota limits.

### Motion behavior

- Accept GPS every 2–5 seconds while moving and less frequently while stopped.
- Broadcast accepted points, not raw noisy samples.
- Interpolate marker position and heading with `requestAnimationFrame`.
- Snap display to route only within a configurable confidence threshold.
- Show a visible stale state after 15–30 seconds and offline after a policy
  threshold; never keep animating a disconnected bus.
- Respect reduced-motion preferences by disabling nonessential camera/marker
  animation.

### Driver tracking client

V1 recommendation: responsive driver PWA for foreground trip tracking and QR
scanning, with a clear “Keep this screen open” state. Browser geolocation
requires HTTPS and explicit user permission. Reliable background tracking when
the screen is locked should be treated as a native-app requirement, not assumed
from a web PWA.

## 9. UX and UI Plan

### Admin transport workspace

Use one responsive `/admin/bus` workspace with:

- overview KPIs: active trips, buses online, delayed trips, unresolved alerts;
- tabs: Live Map, Trips, Students, Routes, Fleet, Drivers, Maintenance, Reports;
- split map/list dispatch board with status filters and search;
- setup checklist for empty schools;
- actionable empty/error/offline states;
- drawers for quick details and full pages for complex editing;
- bulk assignment/import with dry-run conflict review;
- desktop dense operations view and mobile emergency monitoring view.

### Route builder

- map plus ordered stop panel;
- click/search to add stop;
- drag to reorder;
- route line and direction arrows;
- time-window and geofence controls;
- unsaved-change warning, validation summary, preview, and publish action.

### Driver experience

- large high-contrast controls usable one-handed;
- today’s vehicle/trip card and pre-trip checklist;
- explicit GPS permission and signal-quality state;
- Start Trip, Pause, Emergency, Delay, and End Trip actions;
- next-stop card, roster progress, QR scan, and manual fallback;
- no distracting map interaction while vehicle is moving.

### Parent experience

- child selector first, never fleet selector;
- assigned bus, driver name/photo policy, stop, planned pickup, live ETA;
- smoothly moving bus on route with next-stop progress;
- last-updated and offline indicators;
- boarding/alighting timeline and delay/cancellation notifications;
- privacy-safe contact path through school, not raw personal phone exposure.

### Accessibility and localization

- English and Khmer labels and notification templates;
- semantic tables/forms, keyboard route editing alternatives, clear focus;
- status never communicated by color alone;
- screen-reader live regions for ETA/status without announcing every GPS point;
- reduced-motion support and high-contrast map/list fallback.

## 10. Notifications

Initial events:

- trip started;
- bus approaching assigned stop;
- delayed/cancelled;
- student boarded/alighted;
- wrong-stop or unresolved handoff;
- route/stop assignment changed;
- emergency communication.

Use existing in-app notifications first. Add SMS/email/push only through school
policy, notification preferences, rate limits, templates, delivery logging, and
idempotency. Geofence notifications must be emitted once per trip/stop/event.

## 11. Privacy, Safety, and Retention

- Parents see only trips connected to their linked children.
- Students see only their own transport data.
- Drivers see only assigned active trips and roster fields required for safety.
- Exact live/history location is sensitive data; audit privileged access.
- Default location retention recommendation: detailed points 30 days, then
  aggregate trip metrics; legal/product approval required before acceptance.
- Boarding and incident retention follows school/legal policy.
- Encrypt transport secrets, never place provider server keys in the browser,
  and redact sensitive payloads from logs.
- Add emergency revocation for driver sessions/devices.
- Prevent trip start for maintenance/out-of-service vehicles.

## 12. Delivery Stages and Gates

### Stage 0 — Decisions and prototypes

- Accept compiled-module boundary and extension-demo scope.
- Select map tiles, routing, and geocoding provider.
- Decide foreground PWA versus native background tracking roadmap.
- Approve roles, retention, notification channels, GPS frequency, and emergency
  policy.
- Prototype Cambodia route coverage, Khmer labels, and moving-marker UX.

Gate: product, security, operations, and one school transport operator approve
the workflow and infrastructure choices.

### Stage 1 — Secure transport foundation

- Add versioned migrations and relational fleet/driver models.
- Add DTO validation, tenant ownership checks, permissions, audit, and errors.
- Implement fleet, drivers, routes, stops, schedules, and student assignments.
- Replace nonexistent links with working routes or remove them until delivered.
- Add data backfill for existing buses/routes/stops.

Gate: CRUD/assignment tests, role tests, tenant E2E, migration rehearsal, and
production builds pass; no parent can enumerate unrelated buses/students.

### Stage 2 — Trip operations

- Generate trip instances from schedules/holidays.
- Build dispatch board, substitutions, inspections, trip lifecycle, and roster.
- Add boarding/alighting and handoff events using existing student QR identity.
- Add capacity and unresolved-student safeguards.

Gate: one complete scheduled trip runs from dispatch through all student
handoffs with immutable audit evidence and rollback-safe migration behavior.

### Stage 3 — Authenticated live tracking

- Build driver session and foreground GPS publisher.
- Replace insecure bus socket behavior with authenticated tenant/trip rooms.
- Add sample validation, rate limiting, replay/outlier filtering, and retention.
- Build admin and parent live maps with route line, smooth marker, heading, ETA,
  stale/offline states, and reconnect behavior.

Gate: two-school realtime E2E proves cross-tenant and unrelated-parent denial;
load test supports accepted fleet/update rate; revoked sessions stop publishing
immediately; map visual and reduced-motion tests pass.

### Stage 4 — Notifications and safety operations

- Add approaching, delay, cancellation, boarding, and handoff notifications.
- Add incidents, emergency workflow, maintenance, and out-of-service controls.
- Add delivery/idempotency monitoring and operator alerting.

Gate: simulated delay, cancellation, GPS loss, incident, and emergency scenarios
notify only affected users and remain auditable without duplicate alerts.

### Stage 5 — Reporting and production hardening

- Add punctuality, ridership, utilization, distance, GPS quality, incident,
  maintenance, and notification-delivery reports.
- Add provider quota/cost monitoring, tracing, dashboards, backups, restore, and
  retention jobs.
- Perform field pilot on real driver devices and weak mobile networks.
- Package the safe `BUS_OPERATIONS_DEMO` declarative extension ZIP.

Gate: pilot sign-off from admin/dispatcher, driver, and parent; production-sized
migration rehearsal; security review; backup/restore; and manual acceptance.

## 13. Test Strategy

- Unit: DTOs, permissions, trip state machine, ETA/geofence, GPS validation,
  assignment/capacity, notification idempotency.
- Integration: migrations, route versioning, trip generation, roster snapshot,
  boarding, maintenance restrictions, retention.
- HTTP E2E: every role and cross-school resource identifier.
- Socket E2E: handshake, room authorization, publish authorization, replay,
  revocation, disconnect, reconnect, tenant isolation.
- Load: accepted buses × location frequency × parent/admin subscribers.
- Frontend: route builder, dispatch board, driver controls, child-scoped parent
  view, empty/error/stale/offline behavior.
- Visual: desktop/mobile maps, light/dark, English/Khmer, reduced motion.
- Field: GPS accuracy, battery use, network loss, locked-screen behavior, QR
  scanning, and Cambodia address/route quality.

## 14. Acceptance Scenario

The module is complete only when this scenario passes without source edits:

1. School enables BUS.
2. Admin creates vehicle/driver, draws and publishes a route, schedules a trip,
   and assigns two linked students to stops.
3. Driver completes inspection and starts the assigned trip on a real device.
4. Admin sees smooth live motion and operational status.
5. Parent A sees only Child A’s bus, ETA, and boarding events; Parent B cannot
   access that trip unless their own child is assigned.
6. Driver boards/alights students, handles a delay, and completes all handoffs.
7. Notifications are targeted and not duplicated.
8. GPS loss and driver-session revocation produce correct stale/offline states.
9. Trip history, audit, reports, retention, backup, and restore are verified.

## 15. Decisions Required Before Coding

1. Is foreground PWA tracking sufficient for V1, or is locked-screen native
   background tracking mandatory?
2. Which tile, routing, and geocoding provider is approved and budgeted?
3. Who may act as dispatcher and bus assistant in the existing role system?
4. Must parents see driver identity, and which fields are permitted?
5. What are exact location, boarding, incident, and report retention periods?
6. Which notification channels are required for V1?
7. Is QR boarding mandatory, optional, or deferred?
8. Should the extension test be the safe operations demo, or should the
   extension runtime first gain approved map/geolocation capabilities?

## 16. External Technical Constraints

- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [Browser geolocation `watchPosition`](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition)
- [MapLibre GL JS realtime and animation examples](https://maplibre.org/maplibre-gl-js/docs/examples/)

