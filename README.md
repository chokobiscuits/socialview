# SocialView

A unified dashboard that aggregates your own video view counts across YouTube,
TikTok, and Instagram onto one screen.

## The idea

Every platform's analytics page answers "how is this video performing here?"
None of them answer "how is my content performing?" SocialView pulls the numbers
from each platform's API into one database and shows them together.

## The interesting constraint

**No platform API returns view history. They only ever report the current
total.** So the sparklines, the "views over time" chart, and "+142 today" cannot
be fetched from anywhere; they have to be derived.

SocialView captures an hourly snapshot of every video's view count and computes
every time-based number by diffing those snapshots. A consequence worth being
honest about: on a fresh account the charts have nothing to draw, so they say
"Collecting data" rather than drawing a flat line at zero or inventing a trend.

## Architecture

```
Browser
   |
Next.js (App Router)
   |
   +-- Server Components ---> Prisma ---> PostgreSQL
   |
   +-- /api/connect/[platform]  (OAuth data-connection flows)
   +-- /api/cron/sync           (hourly, Vercel Cron)
                |
                +-- PlatformAdapter --> YouTube / TikTok / Instagram APIs
```

### Login is not the same thing as a data connection

Signing in with Google requests `openid email profile` and nothing more.
Granting access to your videos is a **separate** OAuth flow, stored as a
`PlatformConnection`. YouTube is a data connection even though it is also
Google. Folding `youtube.readonly` into the sign-in consent screen would force
every user to hand over their video data merely to create an account.

### One adapter interface, three platforms

```ts
interface PlatformAdapter {
  authorizeUrl(state, redirectUri): string;
  exchangeCode(code, redirectUri): Promise<{ tokens; account }>;
  refresh(refreshToken): Promise<TokenSet>;
  fetchVideoStats(ctx): AsyncIterable<VideoStatDTO>;   // streams, so a large
}                                                       // library stays bounded
```

The sync job never branches on which platform it is talking to. Their quirks
stay inside their adapters:

| Platform | Shape |
|---|---|
| **YouTube** | Batches 50 video IDs into one `videos.list` call. Avoids `search.list`, which costs 100 quota units instead of 1. |
| **TikTok** | Calls it a `client_key`, not a `client_id`. Puts `fields` in the query string and paging in the JSON body. Returns **HTTP 200 with a failure code inside the body**, so checking `res.ok` alone silently accepts errors. |
| **Instagram** | Has no refresh-token grant. You trade a still-valid 60-day token for a fresh one, so the token manager refreshes a week early. Views need one insights call **per media**, throttled to 3 concurrent. |

### Failure isolation

One connection failing must never stop the others. Each is synced independently
and gathered with `Promise.allSettled`. A revoked grant flips that connection to
`NEEDS_REAUTH`; a transient 500 records the error but leaves it `ACTIVE`,
because a bad gateway is not a withdrawn consent.

### Tokens

OAuth tokens are encrypted at rest with AES-256-GCM (authenticated, so a
tampered ciphertext throws rather than decrypting to garbage), with a fresh IV
per value and a `v1:` version prefix for future key rotation. The database is
treated as untrusted; plaintext never reaches it.

## Stack

Next.js 16 - React 19 - TypeScript - Tailwind v4 - shadcn/ui - Recharts -
Prisma 7 - PostgreSQL - Auth.js v5 - Vercel

## Running it

```bash
npm install
cp .env.example .env               # then fill it in
npx prisma dev --name socialview   # local Postgres, or point at your own
npx prisma db push
npm run dev
```

You need at minimum a Google Cloud project with the YouTube Data API v3 enabled
and an OAuth client. TikTok and Instagram are optional; the UI detects missing
credentials and shows those platforms as unavailable rather than crashing.

## Tests

```bash
npm test                   # unit, no database needed
npm run test:integration   # against an isolated `test` schema
```

The integration tests truncate tables, so they refuse to run unless the database
is local **and** pinned to a schema other than `public`. Snapshot history cannot
be reconstructed once deleted, which makes that guard worth having.

## Scripts

| Command | Purpose |
|---|---|
| `npm run db:test:setup` | (Re)build the isolated `test` schema |
| `npm run db:backfill` | Synthesize snapshot history so the charts have something to draw during development. `-- --undo` removes it. |
| `node --env-file=.env scripts/shot.mjs out.png dashboard` | Screenshot a signed-in page |
