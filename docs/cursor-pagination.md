# Cursor Pagination

Collection endpoints use opaque, URL-safe keyset cursors and bounded page
limits. The shared default is 50 and the hard maximum is 100. Invalid cursors
or limits return `400`; offset pagination is not used for growing operational
tables.

The platform school directory orders by
`createdAt DESC, id DESC`, applies the cursor as a strict keyset boundary, and
returns:

```json
{ "items": [], "nextCursor": null, "limit": 50 }
```

Search and status filters execute server-side and must be repeated unchanged
when following `nextCursor`. The platform UI resets the cursor when either
filter changes and exposes an explicit load-more action.

The platform extension catalog, platform installation queue, school extension
marketplace, and school installation manager also return bounded cursor pages.
Their existing dashboards consume pages through `apiCursorItems`, which follows
at most 100 pages and fails rather than looping indefinitely on a malformed
cursor response. Installation cursors use `updatedAt, id`; catalog cursors use
`createdAt, id`.

School users are ordered by `updatedAt, id`. Admin and public post feeds use a
compound `pinned, createdAt, id` cursor so pinned content remains first across
page boundaries rather than being reordered or duplicated. Existing school UI
consumers use the bounded cursor loader; the public homepage reads the first
published page only.

Tenant audit logs are ordered by `createdAt, id` and return a bounded cursor
page plus the exact filtered `total` and derived `pages` used by the audit UI.
Audit facets and statistics are computed per request; process-local aggregate
caches are prohibited because a controller instance serves multiple schools.

The platform daily-usage comparison pages schools by `createdAt, id` before
loading metrics for only those school IDs. The frontend follows those bounded
pages, so a 1,000-school deployment never returns the entire tenant directory
or its usage rows in one database query or HTTP response.

Platform publisher, signing-key history, and operational-alert endpoints also
use `createdAt, id` or `lastSeenAt, id` cursor boundaries. Publisher cards cap
their nested member and key previews at 100 rows; complete key history remains
available through its independently paginated endpoint.

Declarative runtime record resources are tenant- and extension-scoped, ordered
by `createdAt, id`, and bounded by the same cursor contract. Dynamic extension
pages follow pages through the guarded frontend loader rather than requesting
an unbounded resource array.

The platform administrator directory is also keyset-paged by `createdAt, id`.
Control-plane identities are expected to remain few, but are not granted an
unbounded-list exception.

Release validation reports and review history are independently cursor-paged;
extension cards and compatibility summaries cap nested release previews at 100
versions. Review events are fetched newest-first and restored to chronological
display order by the platform UI.

Remaining retained collection endpoints must adopt this same contract before
the platform-wide TODO can be marked complete. Rollback for an individual
endpoint restores its former array response and matching frontend consumer in
the same deployment.

## Enforcement

`src/database/collection-pagination-registry.spec.ts` is the reviewed registry
of growing HTTP collections. It requires every registered controller contract
to expose both `cursor` and `limit`, prevents duplicate route entries, and
locks the shared maximum page size at 100. Any new growing collection must be
added to that registry and use the shared cursor helpers before merge.
