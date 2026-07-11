# SocialView Architecture

How the app is put together: the data pipeline, the schema, and why each piece
works the way it does.

## The core problem

Every platform's analytics page answers *"how did this video do on this
platform?"* SocialView answers *"how is my content doing, everywhere?"* by
pulling view counts from YouTube, TikTok, and Instagram into one database and
showing them on one screen.

One fact shapes the entire design:

> **No platform API returns view history. They only ever report the current
> total.**

So the sparklines, the "views over time" chart, "+142 today", and Biggest Movers
cannot be fetched from anywhere. They are **derived** by capturing a snapshot of
every video's counts on a schedule and diffing those snapshots. On a fresh
account the charts have nothing to draw, so they honestly say *"Collecting
data"* rather than inventing a trend.

## The pipeline, end to end

```
  1. SIGN IN                2. CONNECT                 3. SYNC (hourly)
  ┌──────────┐              ┌──────────────┐           ┌──────────────────┐
  │  Google  │              │  YouTube     │           │  GitHub Actions  │
  │  OAuth   │              │  TikTok      │           │  cron (0 * * * *)│
  └────┬─────┘              │  Instagram   │           └────────┬─────────┘
       │ name+email         └──────┬───────┘                    │ Bearer CRON_SECRET
       ▼                           │ read-only token            ▼
  ┌──────────┐              ┌──────▼───────┐           ┌──────────────────┐
  │  User /  │              │ PlatformConn │           │ /api/cron/sync   │
  │  Session │              │ (token       │           │   runSync()      │
  └──────────┘              │  ENCRYPTED)  │           └────────┬─────────┘
                            └──────────────┘                    │
                                                    per connection, isolated
                                                                ▼
                                        ┌───────────────────────────────────┐
                                        │ PlatformAdapter.fetchVideoStats()  │
                                        │   YouTube / TikTok / Instagram     │
                                        └───────────────┬───────────────────┘
                                                        ▼
                                        ┌───────────────────────────────────┐
                                        │ upsert Video  +  append ViewSnapshot│
                                        │ (one capturedAt bucket per run)     │
                                        └───────────────┬───────────────────┘
                                                        ▼
  4. READ                                ┌───────────────────────────────────┐
  Server Components ─── Prisma ─────────▶│  PostgreSQL (Supabase)             │
  (dashboard, analytics, ...)            └───────────────────────────────────┘
       │ diff snapshots
       ▼
  charts, movers, "+today", % change
```

### Step 1 — Sign in (identity only)

Google is the **only** login provider. The sign-in consent screen requests
`openid email profile` and nothing else. This is deliberate: read access to your
videos is a *separate* grant (step 2). Folding `youtube.readonly` into login
would force every user to hand over their video data just to create an account.

Auth.js v5 with the Prisma adapter stores the `User`, `Account`, and `Session`
rows. Login populates `session.user.id`, which everything downstream keys on.

### Step 2 — Connect a platform (data grant)

Connecting a channel is a second OAuth flow, one per platform, that produces a
`PlatformConnection` rather than a session. YouTube is a connection *even though
it is also Google* — a different grant with different scopes.

All three flows share one route, `/api/connect/[platform]`, and one interface:

```ts
interface PlatformAdapter {
  authorizeUrl(state, redirectUri): string;              // where to send the user
  exchangeCode(code, redirectUri): { tokens, account };  // trade code for tokens
  refresh(refreshToken): TokenSet;                       // mint a fresh token
  fetchVideoStats(ctx): AsyncIterable<VideoStatDTO>;     // stream the videos
}
```

The `state` parameter is HMAC-signed with `AUTH_SECRET` and carries the userId,
so a crafted callback URL cannot bind someone else's channel to your account.

The returned tokens are **encrypted with AES-256-GCM before they touch the
database** (`accessTokenEnc`, `refreshTokenEnc`). The database is treated as
untrusted; plaintext tokens never reach it, and never reach the browser.

Platform quirks stay inside their adapters:

| Platform | Notable behaviour |
|---|---|
| **YouTube** | Batches 50 video IDs into one `videos.list` call; avoids `search.list`, which costs 100 quota units instead of 1. Access token 1 h, refresh token long-lived. |
| **TikTok** | Uses `client_key`, not `client_id`. Puts `fields` in the query string, paging in the JSON body. Returns **HTTP 200 with a failure code inside the body**, so `res.ok` alone is not enough. Access token 24 h, refresh token 1 y. |
| **Instagram** | Has **no refresh grant**: a single 60-day token is exchanged for a fresh one before it lapses, so the token manager refreshes ~7 days early. Views need **one insights call per media** (an N+1), throttled to 3 concurrent. |

### Step 3 — Sync (the hourly heartbeat)

`runSync()` is the heart of the pipeline. It runs hourly, triggered by a GitHub
Actions cron that hits `/api/cron/sync` with a `Bearer CRON_SECRET` header
(Vercel's Hobby plan caps cron at once per day, so the real schedule lives in
`.github/workflows/sync.yml`).

For each `ACTIVE` connection, **isolated** so one failure never stops the others
(`Promise.allSettled`, bounded concurrency):

1. **Token step** — decrypt the access token; refresh it if near expiry, using a
   per-platform window. If the grant is revoked (`invalid_grant`,
   `deleted_client`, ...), flip the connection to `NEEDS_REAUTH` and skip it. A
   transient 500 records the error but leaves it `ACTIVE` — a bad gateway is not
   a withdrawn consent.
2. **Fetch** — iterate `adapter.fetchVideoStats()` (an async generator, so a
   large library streams rather than buffering).
3. **Persist** — for each video, `upsert` the `Video` row (keyed on
   `[platform, externalId]`, so re-syncing updates rather than duplicates), then
   `upsert` a `ViewSnapshot`. Every snapshot in one run shares a single
   `capturedAt`, **floored to the hour**, so the time series is a clean
   `GROUP BY capturedAt` and a re-run within the same hour overwrites rather than
   double-counts.

### Step 4 — Read (Server Components diff the snapshots)

Every dashboard page is a React Server Component that reads Prisma directly — no
client-side fetching, no API layer for reads. Route handlers exist only for
Auth.js, the connect callbacks, and the cron.

- **"Now" values** (total views, Top Videos) read the denormalized
  `Video.currentViews`, so they work from the very first sync.
- **Everything time-based** is a diff over `ViewSnapshot`: sparklines, the area
  chart, "% vs previous period", "views today", Biggest Movers. With fewer than
  two snapshot buckets these return `null`, and the UI shows *"Collecting data"*
  rather than a fabricated zero.

The date-range picker lives in the URL (`?range=30d`), so a Server Component
reads it from `searchParams` and re-queries — no client store, and any view is
shareable.

## The schema

Two ideas drive it: **login and data-connection are different things**, and
**snapshots are the only source of history**.

### Auth.js core

Standard Auth.js models. `User` is the identity; `Account` and `Session` are
owned by the adapter.

```
User (id, name, email, image, createdAt)
  ├── accounts    Account[]           -- Google identity
  ├── sessions    Session[]
  ├── connections PlatformConnection[]  -- the data grants
  └── videos      Video[]
```

### PlatformConnection — a connected channel

```
PlatformConnection
  id, userId, platform (YOUTUBE|TIKTOK|INSTAGRAM)
  externalAccountId      -- YT channelId / TikTok open_id / IG user id
  displayName, avatarUrl
  accessTokenEnc         -- AES-256-GCM ciphertext, format v1:<iv>:<tag>:<ct>
  refreshTokenEnc
  accessExpiresAt, refreshExpiresAt
  status                 -- ACTIVE | NEEDS_REAUTH | REVOKED
  lastSyncedAt, lastSyncError
```

| Constraint | Why |
|---|---|
| `@@unique([platform, externalAccountId])` | One real channel can be claimed by exactly one SocialView user, so two users can't double-sync it and corrupt the aggregate. Reconnecting upserts on this key. |
| `@@index([userId, platform])` | A user may connect **several** channels per platform (this replaced an earlier `unique([userId, platform])`). |

### Video — one row per real video

```
Video
  id, userId, connectionId, platform
  externalId             -- the platform's video id
  title, thumbnailUrl, permalink, publishedAt
  currentViews  BigInt   -- denormalized "now" value, refreshed every sync
  currentLikes  BigInt
  currentComments BigInt
  statsUpdatedAt
```

| Constraint | Why |
|---|---|
| `@@unique([platform, externalId])` | The sync upsert key — guarantees idempotency, so re-running a sync updates rows instead of inserting duplicates. |
| `@@index([userId, currentViews])` | Serves Top Videos and movers ordering. |

`BigInt` for counts: a single video fits in an `Int`, but `SUM(views)` across a
large library with viral outliers can exceed 2³¹. Serialized to `Number` at the
Server-Component boundary.

### ViewSnapshot — the time series

```
ViewSnapshot
  id, videoId
  capturedAt   -- floored to the hour; one bucket per sync run
  views, likes, comments  BigInt
```

| Constraint | Why |
|---|---|
| `@@unique([videoId, capturedAt])` | Two syncs in the same hour overwrite that hour's reading instead of duplicating it, so `GROUP BY capturedAt` never double-counts. |
| `@@index([videoId, capturedAt])` | Per-video series lookups. |
| `@@index([capturedAt])` | Period-wide aggregation windows. |

This is the table everything time-based is computed from. Delete it (e.g. by
disconnecting a platform) and the history is gone for good — the APIs only report
current totals, so it cannot be rebuilt.

## Derived metrics

| Metric | How it's computed |
|---|---|
| Total views (now) | `SUM(currentViews)` — no snapshots needed |
| Top Videos | `ORDER BY currentViews DESC` |
| Sparkline / area series | `SUM(views) GROUP BY capturedAt`, joined to Video, filtered by user and optionally platform |
| % vs previous period | Snapshot nearest each boundary via `DISTINCT ON (videoId)`, current-period delta vs the prior period's |
| Views today | Latest total − total at start of day (null if today has no baseline) |
| Biggest Movers | Per video, latest reading − the reading *before the window opened* (falls back to the first in-window reading), ranked by the delta |

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, RSC, Server Actions) |
| UI | React 19, Tailwind v4, shadcn/ui, Recharts |
| ORM / DB | Prisma 7 (driver adapter) + PostgreSQL (Supabase) |
| Auth | Auth.js v5 (Google) |
| Hosting | Vercel; hourly sync via GitHub Actions |

### Two production gotchas worth knowing

- **`$queryRaw` needs `search_path` set on the pool.** Prisma's adapter
  schema-qualifies model queries but passes raw SQL through verbatim; with the
  wrong `search_path`, unqualified identifiers resolve to *nothing and return
  zero rows without erroring*. `src/lib/db.ts` sets it on every connection.
- **Supabase's TLS uses a private CA.** node-postgres connects in cleartext
  unless given an `ssl` option, and Supabase's cert isn't in any system trust
  store, so the app pins the Supabase root CA (`src/lib/supabase-ca.ts`) and
  verifies against it.

## Where things live

```
src/
  auth.ts                     Auth.js config (Google login only)
  proxy.ts                    edge auth gate (cookie check; real check is in each page)
  lib/
    db.ts                     Prisma client (pinned TLS, search_path)
    crypto.ts                 AES-256-GCM token encryption
    env.ts                    validated server env
    platforms.tsx             brand colors, icons, labels
    ranges.ts / format.ts     date windows, number formatting
  services/
    types.ts                  PlatformAdapter interface + DTOs
    registry.ts               platform -> adapter, isConfigured()
    {youtube,tiktok,instagram}/adapter.ts
    connect.ts                redirect URIs, scopes
    oauth-state.ts            signed CSRF state
    sync/
      run-sync.ts             orchestration, failure isolation
      token-manager.ts        per-platform refresh policy
  server/queries/             all Prisma reads for Server Components
  app/
    (dashboard)/              dashboard, videos, analytics, calendar, platforms, settings
    (legal)/                  privacy, terms (public)
    api/auth, api/connect, api/cron
  components/                 layout, dashboard, analytics, videos, calendar
```
