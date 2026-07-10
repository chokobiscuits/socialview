/**
 * Integration tests truncate tables. That is fine against a throwaway schema
 * and catastrophic against real data: snapshot history can never be
 * reconstructed, because the platform APIs only ever return "views right now".
 *
 * So they must satisfy BOTH conditions before a single row is deleted:
 *   1. the database is local, and
 *   2. they are pinned to a schema other than `public`.
 *
 * Condition 2 is what stops `npm run test:integration` from wiping the
 * development database it shares a host with.
 */
export function assertDisposableDatabase(
  url = process.env.DATABASE_URL,
  schema = process.env.DATABASE_SCHEMA,
): void {
  if (!url) throw new Error("DATABASE_URL is not set");

  const host = new URL(url).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal) {
    throw new Error(
      `Refusing to run destructive integration tests against a non-local database (host: ${host}).\n` +
        `These tests call deleteMany() and would erase real snapshot history, which cannot be recovered.`,
    );
  }

  if (!schema || schema === "public") {
    throw new Error(
      `Refusing to run destructive integration tests against the "${schema ?? "public"}" schema.\n` +
        `They would truncate your development data. Run them with .env.test, which pins DATABASE_SCHEMA=test:\n` +
        `  npm run test:integration`,
    );
  }
}
