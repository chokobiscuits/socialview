import { randomBytes } from "node:crypto";

/**
 * Generates the three secrets Vercel needs. Run it yourself and paste the
 * output straight into Vercel; the values never travel through anything else.
 *
 *   node scripts/gen-secrets.mjs
 *
 * TOKEN_ENCRYPTION_KEY is the one to be careful with: it encrypts every stored
 * OAuth token. Change it and every existing connection becomes undecryptable,
 * forcing every user to reconnect. Set it once and keep it.
 */
const b64 = (n) => randomBytes(n).toString("base64");

console.log(`
Paste these into Vercel -> Settings -> Environment Variables.
Scope each to Production, Preview, and Development.

AUTH_SECRET=${b64(32)}
TOKEN_ENCRYPTION_KEY=${b64(32)}
CRON_SECRET=${randomBytes(24).toString("hex")}

Keep TOKEN_ENCRYPTION_KEY forever. Rotating it orphans every stored token.
`);
