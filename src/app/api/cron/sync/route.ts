import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runSync } from "@/services/sync/run-sync";

// Prisma, node:crypto, and long-running fetches all need the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 300;
// Never cache a job.
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on scheduled
 * invocations when CRON_SECRET is set as an environment variable. Anything
 * else gets a 401, so the endpoint is not publicly triggerable.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const summary = await runSync();
  // A partial failure is still a 200: the cron ran, and the body reports which
  // connections fell over. A 500 would make Vercel retry the healthy ones too.
  return NextResponse.json(summary);
}
