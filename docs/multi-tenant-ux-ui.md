# Multi-Tenant UX/UI Specification — Platform Tier

Companion document to the multi-tenant conversion plan (`smooth-stirring-taco.md`). Scope, per decision: **new surfaces only** — the Platform tier (Wattaman-company-facing) and the flows that create/manage schools. The existing per-role dashboards (`admin/`, `teacher/`, `student/`, `parent/`, `accounter/`, `employee/`, `reporter/`, `wattaman/`) are **not** redesigned; they stay exactly as they are today, per the conversion plan's "what does NOT need to be rebuilt" section.

---

## 1. Design foundations — extend, don't reinvent

The app already has a coherent design language. This spec is written to extend it, not introduce a second style:

| Foundation | Current pattern | Source |
|---|---|---|
| Layout shell | `<Sidebar>` component: gradient sidebar (desktop), bottom tab bar + "More" drawer (mobile), title/subtitle, `navItems` array, `accentColor` prop | `frontend/components/Sidebar.tsx` |
| Nav data shape | `{ label, href, icon, section?, badgeKey? }` flat/sectioned arrays, one file per role | `frontend/lib/admin-nav.ts` and siblings |
| Accent colors in use today | `indigo` (Admin), `emerald` (Student/Parent/Employee/Accounter/Teacher/Wattaman), `sky` (Teacher, some screens) | grep across `frontend/app/**` |
| Icons | Shared `iconMap` with SVG icons (`dashboard`, `users`, `shield`, `money`, `globe`, `briefcase`, `chart`, `layers`, `settings`, …), falls back to emoji for anything not in the map | `frontend/components/Icons.tsx` |
| Cards | `rounded-2xl`/`rounded-3xl`, soft gradient fills (`from-emerald-50 to-emerald-100/50`, etc.), colored border/hover states per semantic color (green=success, red=danger, amber=warning, blue=info) | `frontend/app/admin/page.tsx` `CardButton` |
| Hero banner | Full-width `rounded-3xl` gradient hero (`from-indigo-600 via-violet-600 to-fuchsia-600`) with blurred decorative blobs, live-update pulse badge | `frontend/app/admin/page.tsx` |
| i18n | `useLanguage()` / `t()` from `frontend/lib/i18n.tsx`, English + Khmer, toggle lives in the sidebar | `frontend/lib/i18n.tsx` |
| Bilingual scope for Platform tier | **English-only for v1.** This is a Wattaman-internal ops tool, not school-facing — no user-facing requirement to localize it. Keep the `t()`/i18n plumbing available (cheap to wire, matches the rest of the app's convention) but don't block launch on Khmer copy for this tier specifically. |

### New design token: the `platform` accent color

Every existing role has its own `accentColor` (indigo/emerald/sky) so a user can tell at a glance which portal they're in. The Platform tier needs its own, and it should read as **distinctly different from every school-facing color** — a Wattaman staff member should never mistake "I'm in the Platform console" for "I'm in a school's admin panel."

**Recommendation: `slate`** — a dark neutral, not another saturated hue. Add to `Sidebar.tsx`'s `colorMap`:
```ts
slate: {
  bg: 'bg-slate-800',
  text: 'text-slate-300',
  hover: 'hover:bg-white/10',
  active: 'bg-white/18 text-white font-semibold',
  ring: 'ring-slate-500',
  gradient: 'from-[#0f172a] to-[#1e293b]',
},
```
Rationale: indigo/emerald/sky are all cool, vivid, "friendly SaaS" tones appropriate for people using the product day-to-day (teachers, students, parents). Slate reads as infrastructure/ops — appropriate for a smaller audience of Wattaman staff managing customers, and it cannot be confused with any existing role at a glance. (A warm accent like amber was considered and rejected — warm/urgent tones are already used for status badges (below) and would visually compete with them.)

---

## 2. Information architecture

```
Platform Host (app.wattaman.app)
├── /platform                          Dashboard (landing after PLATFORM_ADMIN login)
├── /platform/schools                  Schools list
│   ├── /platform/schools/new          Create school (onboarding wizard)
│   └── /platform/schools/[id]         School detail (tabbed)
│       ├── ?tab=overview              Overview
│       ├── ?tab=branding              Branding preview (read-only link into that school's own appearance data)
│       ├── ?tab=domains               Subdomain + custom domain management
│       ├── ?tab=addons                Add-ons & billing (Phase 7a)
│       ├── ?tab=admins                That school's ADMIN/SUPER_ADMIN users
│       └── ?tab=danger                Suspend / reactivate / delete
├── /platform/admins                   Platform admin user management (PLATFORM_ADMIN accounts)
└── /platform/activity                 Cross-school audit/activity feed (optional, see §6)
```

Tabs on the school detail page use query params (`?tab=`), not nested routes — matches the lightweight-tab convention already used elsewhere in the app (e.g. `admin/appearance`'s sub-sections) rather than introducing a new routing pattern.

---

## 3. Navigation — `frontend/lib/platform-nav.ts`

Follows the exact shape of `admin-nav.ts`:
```ts
export const platformNav = [
  { label: 'Dashboard', href: '/platform', icon: 'dashboard', section: 'Overview' },
  { label: 'Schools', href: '/platform/schools', icon: 'briefcase' },        // no dedicated "school/building" icon exists yet — add one, or fall back to 🏫 emoji via the existing NavIcon fallback in the meantime
  { label: 'Platform Admins', href: '/platform/admins', icon: 'shield', section: 'Access' },
  { label: 'Activity', href: '/platform/activity', icon: 'chart', section: 'Monitoring' },
];
```
Rendered via `<Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />`. Only 4 top-level items — deliberately small; almost everything else lives inside a school's detail tabs, not as separate top-level nav items, since the operator's mental model is "pick a school, then act on it," not "browse a flat feature list" (the opposite of the school-side `admin-nav.ts`, which has ~34 items because a school admin lives inside one tenant all day).

**Mobile**: the Platform tier is a back-office tool used primarily at a desk. Still support the existing responsive breakpoints (don't build a desktop-only page — `Sidebar` already handles this for free), but don't invest in a custom bottom-tab order the way `pickBottomTabs()` does for the school-facing roles — the default auto-pick behavior (first item + priorities + "More") is sufficient given only 4 nav items exist.

---

## 4. Key screens

### 4.1 Platform Dashboard (`/platform`)

**Purpose**: orientation on login — how is the platform doing as a whole.

**Layout**: reuse the hero-banner + stat-tile pattern from `admin/page.tsx`, restyled with the `slate` gradient instead of indigo/violet/fuchsia.
- Hero: "Welcome back, {name}" + at-a-glance counts — total schools, active schools, schools in trial, schools suspended.
- Stat tiles (reuse `CardButton`'s colored-card pattern): Total Students (sum across all schools), Total Staff, Add-ons Active (count of `SchoolAddon` rows with `enabled: true`), Schools Created This Month.
- Quick actions: "Create School" (primary button, top-right of hero — this is the single most common action on this screen), "View Schools".
- Recent activity strip (optional, can point at `/platform/activity` if built): last 5 school-creation/status-change events.

**States**: empty state matters here more than elsewhere — day one, this dashboard shows "0 schools." Design the empty state as an explicit onboarding prompt ("You haven't added any schools yet — Create your first school") rather than a dashboard full of zeroes, which reads as broken rather than new.

### 4.2 Schools List (`/platform/schools`)

**Purpose**: find/filter schools, primary entry point to any per-school action.

**Layout**: table (not cards — this is operational data meant to be scanned, sorted, and filtered, unlike the school-facing "browse and click" dashboards). Columns: School name, Subdomain (shown as the clickable `<slug>.wattaman.app` link), Status badge, Students count, Created date, quick actions (view/suspend).

**Status badge colors** — reuse the existing semantic-color convention (green/red/amber/blue cards seen in `admin/page.tsx`):
- `ACTIVE` → emerald pill
- `TRIAL` → amber/blue pill (amber reads better as "time-limited," reserve blue for purely informational states)
- `SUSPENDED` → rose/red pill

**Controls**: search-by-name input, status filter dropdown, "+ Create School" primary button top-right. Pagination if the list grows past ~30-50 rows (standard table pagination, not infinite scroll — operators need stable row positions when cross-referencing with a billing spreadsheet).

**Empty/filtered-empty states**: distinguish "no schools exist yet" (onboarding prompt, same as dashboard) from "no schools match this filter" (offer to clear filters).

### 4.3 Create School — onboarding wizard (`/platform/schools/new`)

**Purpose**: the highest-stakes flow on this whole tier — get this right, since a mistake here (e.g. a slug typo) is annoying to unwind later (Phase 1's `School.subdomain` is `@unique`, and changing a live subdomain after a school's users have bookmarked it is a real support cost).

**Recommend a 3-step wizard, not one long form** — each step validates before advancing, so mistakes surface early rather than after a 15-field form submit:

1. **School details** — Name (free text), Subdomain (slugified live from the name as the operator types, but editable — show the resulting URL preview inline: `→ greenhill.wattaman.app`, with a live availability check debounced against `GET /platform/schools/check-subdomain?slug=`, red inline error if taken).
2. **First admin account** — Name, email, phone (at least one required, matching the existing `User` model's `email`-or-`phone` flexibility), auto-generate a strong temporary password (shown once, copyable) rather than asking the operator to invent one — this account is how the school gets in the door for the first time.
3. **Review & confirm** — summary of steps 1-2, a single "Create School" submit. On success: a confirmation screen (not just a toast) showing the subdomain URL, the admin's login email/temp password, and a "Copy setup details" button — this is the information the operator needs to hand off to the school, so make it easy to copy/export, not something that flashes and disappears.

**Failure handling**: if creation partially fails (e.g. `School` row created but admin-user creation fails), the confirmation screen must clearly show what succeeded vs. what didn't and offer a retry for just the failed part — don't silently leave a school with no admin able to log in.

### 4.4 School Detail (`/platform/schools/[id]`)

**Purpose**: single place to manage one tenant. Header stays constant across all tabs: school name (editable inline), status badge, subdomain link, "Impersonate/View as this school" action (per the conversion plan's Phase 6a — reuses the normal scoped path, not `unscoped` mode) and a settings/danger-zone entry point.

**Tabs:**

- **Overview** — key stats for this one school (students, staff, classes, storage/usage if tracked), creation date, last-login timestamp for its admin.
- **Branding** — this tier does **not** duplicate the existing branding editor (colors/logo/hero slides already live in that school's own `admin/appearance` UI, per Phase 1d + 5c of the conversion plan). Show a **read-only preview** instead: rendered mini-preview of the school's current logo/colors/site name, with a "this is managed by the school's own admin" note. Avoids building and maintaining two editors for the same data.
- **Domains** — see §5 below, dedicated section given its complexity.
- **Add-ons & Billing** — per Phase 7a of the conversion plan: list of `SchoolAddon` rows (key, billing status, enabled toggle, activated-by/date, notes field for invoice reference). Each row's manual toggle is the entire "billing system" for this phase — no payment UI, just a status control.
- **Admins** — read-only list of that school's `ADMIN`/`SUPER_ADMIN` users (name, email, last login), with a "reset password" action for support purposes. Platform admins manage *who can be an admin of this school* only in a support capacity — day-to-day user management stays inside the school's own `admin/users` page, not duplicated here.
- **Danger Zone** — Suspend (soft, reversible — sets `School.status = SUSPENDED`, blocks login for that school's users with a clear "this school's access has been suspended by Wattaman" message rather than a generic error) and a separate, harder-to-reach Delete action (should require typing the school's name to confirm, standard "type to confirm" pattern for irreversible actions — no such pattern currently exists in this codebase, so it's a new small component worth adding once and reusing anywhere else a destructive confirm is needed).

### 4.5 Platform Admin Users (`/platform/admins`)

**Purpose**: manage who has `PLATFORM_ADMIN` access — a short, sensitive list (Wattaman's own staff, not schools). Simple table + invite flow (email + role, sends a setup link) — no wizard needed here, this list will stay small.

### 4.6 Activity feed (`/platform/activity`) — optional, lower priority

Cross-school audit view for oversight (school created, suspended, add-on activated, platform admin added). Reuses the existing `AuditLog` model/patterns from `admin/audit`, filtered to platform-relevant `action`/`resource` values plus cross-school entries. Treat as a nice-to-have that can ship after §4.1-4.5 — none of the core create/manage-a-school flows depend on it.

---

## 5. Custom domain setup UX

Follows directly from the earlier architecture discussion on Railway custom domains — this is the one flow in the Platform tier with real external dependencies (DNS, a third party), so it needs explicit state handling rather than a simple form field.

**Location**: `/platform/schools/[id]?tab=domains`.

**Always shown**: the school's subdomain (`greenhill.wattaman.app`) as the permanent, always-working default — non-editable after creation (see §4.3 on why changing it later is costly), shown with a copy-link button.

**Custom domain section** (optional, additive — per the earlier design decision that a custom domain layers on top of the subdomain rather than replacing it):
1. **Empty state**: "Add a custom domain" input + short explainer ("Point your school's own domain at Wattaman — e.g. portal.yourschool.com").
2. **Pending state** (after submit): show the exact DNS record the school needs to add (CNAME target from Railway), copy-button on the value, and a status pill "Waiting for DNS…". Poll/refresh a verification check rather than requiring a manual "I've added it, check now" click — reduce round-trips for a non-technical school admin relaying instructions to their own IT person.
3. **Active state**: green "Connected" pill, the domain shown as a clickable live link, option to remove it (falls back to the subdomain — never leaves a school with zero working URL).
4. **Error state**: if DNS is misconfigured or verification times out, show a specific, actionable message (e.g. "We found a CNAME but it doesn't point to the expected target — double check the value below") rather than a generic failure — this flow is handed to non-technical people at the school, so error copy quality matters more here than almost anywhere else in the Platform tier.

---

## 6. Empty / loading / error state conventions (apply across all screens above)

- **Loading**: reuse the existing spinner pattern already in the codebase (`w-10 h-10 rounded-full border-[3px] border-indigo-100` + spinning accent ring, seen in `admin/page.tsx`) — swap the accent color to `slate` for Platform-tier screens, don't invent a new loader.
- **Empty (no data yet)**: always paired with the relevant primary action, never a bare "No results" — e.g. dashboard/schools-list empty states both point at "Create School."
- **Empty (filtered to nothing)**: offer to clear filters, distinct copy from the true-empty state.
- **Destructive actions** (suspend, delete, remove custom domain): confirm dialogs; delete specifically needs the type-to-confirm pattern noted in §4.4.
- **Error toasts/banners**: match whatever pattern the school-facing app already uses for form errors (not audited in this doc — check `frontend/app/admin/*` for the established toast/inline-error component before introducing a new one).

---

## 7. Component reuse checklist

| Need | Reuse | New |
|---|---|---|
| Page shell/sidebar | `Sidebar.tsx` (add `slate` accent) | — |
| Nav data | pattern from `admin-nav.ts` | `platform-nav.ts` |
| Stat tiles / colored cards | `CardButton` pattern from `admin/page.tsx` | — |
| Hero banner | gradient hero pattern from `admin/page.tsx` | restyle to `slate` gradient |
| Status badges (ACTIVE/TRIAL/SUSPENDED) | existing green/amber/red pill conventions | — |
| Icons | `iconMap` (`shield`, `money`, `globe`, `briefcase`, `chart`, `settings`) | a school/building icon for the Schools nav item (fallback: 🏫 emoji via existing `NavIcon` text fallback until added) |
| Loading spinner | existing spinner markup | recolor to `slate` |
| Type-to-confirm destructive dialog | — | new, small, reusable component (first use: school delete) |
| Multi-step wizard (Create School) | — | new — no existing multi-step form pattern in the codebase to reuse |
| Domain-status polling UI | — | new — no existing "waiting on an external DNS check" pattern in the codebase |

---

## 8. Out of scope for this spec (per the "new surfaces only" decision)

- Any redesign of `admin/`, `teacher/`, `student/`, `parent/`, `accounter/`, `employee/`, `reporter/`, or `wattaman/`.
- A school-side "you're on the Platform's radar" indicator (e.g. a banner shown to a school admin when their school is `SUSPENDED`) — this is a real UX need but touches the *school-facing* app, not the Platform tier, so it's flagged here for later scoping rather than designed now.
- The actual face-recognition attendance feature UI (Phase 7a of the conversion plan covers only the add-on gate, not the feature itself).
- Automated billing/payment UI (explicitly deferred per Phase 7a's manual-toggle decision).
