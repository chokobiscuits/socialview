import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations only. Uses the DIRECT (non-pooled) connection, because
    // pgbouncer cannot run DDL. The app itself connects through the pooled
    // DATABASE_URL via the driver adapter in src/lib/db.ts.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    // Only set locally: `prisma dev` runs its shadow database on its own port.
    // On Supabase, Prisma creates and drops a shadow schema by itself.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
