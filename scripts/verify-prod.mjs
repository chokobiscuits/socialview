import { Client } from "pg";
import { readFileSync } from "node:fs";

/**
 * Checks a deployed SocialView without needing any secret.
 *
 *   node --env-file=.env.production.local scripts/verify-prod.mjs https://socialview.vercel.app
 *
 * 1. Database: plant a session row directly in Postgres, then ask the deployment
 *    to read it back through /api/auth/session. If the deployment cannot
 *    authenticate to the database, Auth.js swallows the adapter error and simply
 *    reports "no session" -- a broken database looks exactly like being logged
 *    out, which is why this indirect probe is worth the trouble.
 *
 * 2. OAuth: read the client_id the deployment sends to Google. Client IDs are
 *    public by design, so this reveals nothing, yet it proves whether the
 *    environment variables reached the running build.
 */

const base = (process.argv[2] ?? "https://socialview.vercel.app").replace(/\/$/, "");
const expectedClientId = process.env.GOOGLE_CLIENT_ID;

const ca = readFileSync(new URL("../src/lib/supabase-ca.ts", import.meta.url), "utf8")
  .match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];

const PROBE = "socialview-verify-probe";
let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`);
};

async function withDb(fn) {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL is not set");
  const client = new Client({
    connectionString: url,
    ssl: /supabase\.(com|co)$/.test(new URL(url).hostname)
      ? { ca, rejectUnauthorized: true }
      : undefined,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function cleanup(db) {
  await db.query('DELETE FROM public."Session" WHERE "sessionToken" = $1', [PROBE]);
  await db.query('DELETE FROM public."User" WHERE id = $1', [PROBE]);
}

console.log(`\nVerifying ${base}\n`);

// ---- 1. Can the deployment reach its database?
await withDb(async (db) => {
  await cleanup(db);
  await db.query('INSERT INTO public."User"(id, email, name) VALUES ($1,$2,$3)', [
    PROBE,
    `${PROBE}@example.invalid`,
    "ProbeUser",
  ]);
  await db.query(
    `INSERT INTO public."Session"(id, "sessionToken", "userId", expires)
     VALUES ($1,$2,$3, now() + interval '1 hour')`,
    [PROBE, PROBE, PROBE],
  );
});

const sessionRes = await fetch(`${base}/api/auth/session`, {
  headers: { cookie: `authjs.session-token=${PROBE}` },
});
const sessionBody = await sessionRes.text();
check(
  sessionBody.includes("ProbeUser"),
  "deployment can read its database",
  sessionBody.includes("ProbeUser")
    ? ""
    : `got ${sessionBody.slice(0, 60)} -- its DATABASE_URL is stale or wrong`,
);

await withDb(cleanup);

// ---- 2. Which OAuth client does it present?
// Auth.js checks the csrfToken in the body against a signed cookie, so the
// cookie has to be echoed back verbatim from the /csrf response.
const csrfRes = await fetch(`${base}/api/auth/csrf`);
const { csrfToken } = await csrfRes.json();
const csrfCookie = (csrfRes.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(";")[0])
  .join("; ");

const signin = await fetch(`${base}/api/auth/signin/google`, {
  method: "POST",
  redirect: "manual",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    cookie: csrfCookie,
  },
  body: new URLSearchParams({ csrfToken, callbackUrl: "/dashboard" }),
});
const location = signin.headers.get("location") ?? "";
const clientId =
  location && location.startsWith("http")
    ? new URL(location).searchParams.get("client_id")
    : null;
if (!clientId) {
  console.log(`  WARN  could not read client_id (signin returned ${signin.status})`);
}

if (expectedClientId) {
  check(
    clientId === expectedClientId,
    "deployment uses the expected Google client",
    clientId === expectedClientId ? "" : `sends ${String(clientId).slice(0, 30)}...`,
  );
} else {
  console.log(`  INFO  client_id = ${String(clientId).slice(0, 44)}...`);
}

// ---- 3. Boundaries that must hold regardless.
for (const path of ["/dashboard", "/platforms", "/videos"]) {
  const r = await fetch(`${base}${path}`, { redirect: "manual" });
  check(r.status === 307 || r.status === 302, `${path} rejects anonymous access`);
}
const cron = await fetch(`${base}/api/cron/sync`);
check(cron.status === 401, "/api/cron/sync requires the secret");

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
