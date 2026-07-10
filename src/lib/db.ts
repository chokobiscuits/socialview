import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 takes a driver adapter rather than a connection URL. We point it at
 * the pooled (pgbouncer) Supabase connection; migrations use DIRECT_URL via
 * prisma.config.ts instead, since pgbouncer cannot run them.
 *
 * DATABASE_SCHEMA exists so the destructive integration tests can be pinned to
 * an isolated `test` schema and never truncate real development data.
 *
 * Two separate things need to know the schema:
 *
 *   - The adapter's `schema` option qualifies the queries Prisma builds from
 *     the models (`prisma.video.findMany`, ...).
 *   - The connection's `search_path` is what unqualified identifiers inside
 *     `$queryRaw` resolve against. Get this wrong and raw SQL silently matches
 *     nothing -- it does not error -- so the time-series queries returned zero
 *     rows while the model queries happily returned 125.
 *
 * We set search_path on each new pooled connection rather than through the
 * connection string: the `options=-c search_path=...` URL parameter is a libpq
 * feature that node-postgres does not forward, and the `options` client field
 * is likewise ignored by some servers.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const schema = process.env.DATABASE_SCHEMA ?? "public";

  const pool = new Pool({ connectionString });
  pool.on("connect", (client) => {
    // Fire-and-forget: node-postgres queues this ahead of any user query on
    // that connection.
    void client.query(`SET search_path TO "${schema}"`);
  });

  return new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
