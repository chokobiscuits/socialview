import { readFileSync } from "node:fs";
import { Client } from "pg";

/**
 * Builds the isolated `test` schema that destructive integration tests run
 * against, by replaying the init migration into it. Idempotent: drops and
 * recreates the schema each time.
 */
const MIGRATION = "prisma/migrations/20260709000000_init/migration.sql";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("Refusing to build a test schema on a non-local database");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  await client.query("DROP SCHEMA IF EXISTS test CASCADE");
  await client.query("CREATE SCHEMA test");

  // Scope search_path to this transaction, so it cannot leak into the server's
  // session defaults and silently redirect other connections.
  const sql = readFileSync(MIGRATION, "utf8");
  await client.query("BEGIN");
  await client.query("SET LOCAL search_path TO test");
  await client.query(sql);
  await client.query("COMMIT");

  const { rows } = await client.query<{ n: string }>(
    "SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname = 'test'",
  );
  console.log(`test schema ready: ${rows[0].n} tables`);
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
