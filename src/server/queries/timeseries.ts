import "server-only";
import { prisma } from "@/lib/db";
import type { Platform } from "@/lib/platforms";
import type { Window } from "@/lib/ranges";

/**
 * Everything time-based is derived by diffing ViewSnapshot rows, because no
 * platform API returns view history: they only ever report the current total.
 *
 * Consequence, and we are honest about it in the UI: with fewer than two
 * distinct capturedAt buckets there is no delta to compute, so these return
 * null rather than a fabricated zero.
 */

export type SeriesPoint = { t: Date; views: number };

/** How many distinct hourly buckets exist in range. <2 means "no history yet". */
export async function countBuckets(
  userId: string,
  window: Window,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT s."capturedAt") AS n
    FROM "ViewSnapshot" s
    JOIN "Video" v ON v.id = s."videoId"
    WHERE v."userId" = ${userId}
      AND (${window.start}::timestamptz IS NULL OR s."capturedAt" >= ${window.start})
      AND s."capturedAt" <= ${window.end}
  `;
  return Number(rows[0]?.n ?? 0);
}

/**
 * Total views over time, summed across every video (optionally one platform).
 * One row per hourly bucket. Drives the area chart and the sparklines.
 */
export async function getViewsSeries(
  userId: string,
  window: Window,
  platform?: Platform,
): Promise<SeriesPoint[]> {
  const rows = await prisma.$queryRaw<{ t: Date; views: bigint }[]>`
    SELECT s."capturedAt" AS t, SUM(s.views) AS views
    FROM "ViewSnapshot" s
    JOIN "Video" v ON v.id = s."videoId"
    WHERE v."userId" = ${userId}
      AND (${platform ?? null}::"Platform" IS NULL OR v.platform = ${platform ?? null}::"Platform")
      AND (${window.start}::timestamptz IS NULL OR s."capturedAt" >= ${window.start})
      AND s."capturedAt" <= ${window.end}
    GROUP BY s."capturedAt"
    ORDER BY s."capturedAt" ASC
  `;
  return rows.map((r) => ({ t: r.t, views: Number(r.views) }));
}

/**
 * Total views as of a moment: for each video, its latest reading at or before
 * `at`, summed. `DISTINCT ON` picks one row per video in a single pass.
 *
 * Returns null when no video has any reading by then, which is what makes a
 * "vs previous period" comparison honest on a fresh account.
 */
export async function getTotalAt(
  userId: string,
  at: Date,
): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(latest.views) AS total
    FROM (
      SELECT DISTINCT ON (s."videoId") s."videoId", s.views
      FROM "ViewSnapshot" s
      JOIN "Video" v ON v.id = s."videoId"
      WHERE v."userId" = ${userId} AND s."capturedAt" <= ${at}
      ORDER BY s."videoId", s."capturedAt" DESC
    ) latest
  `;
  const total = rows[0]?.total;
  return total === null || total === undefined ? null : Number(total);
}

export type Change = { current: number; previous: number; percent: number };

/**
 * Growth this period versus the one before it, of equal length.
 * Null when there is not enough history on either side to compare.
 */
export async function getPeriodChange(
  userId: string,
  window: Window,
): Promise<Change | null> {
  if (!window.start || !window.previousStart) return null;

  const [now, atStart, atPrevStart] = await Promise.all([
    getTotalAt(userId, window.end),
    getTotalAt(userId, window.start),
    getTotalAt(userId, window.previousStart),
  ]);

  if (now === null || atStart === null || atPrevStart === null) return null;

  const current = now - atStart;
  const previous = atStart - atPrevStart;
  if (previous <= 0) return null; // No baseline: a percentage would be noise.

  return { current, previous, percent: ((current - previous) / previous) * 100 };
}

/** Views gained since the start of today. Null when today has no baseline. */
export async function getViewsToday(userId: string): Promise<number | null> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [now, then] = await Promise.all([
    getTotalAt(userId, new Date()),
    getTotalAt(userId, startOfDay),
  ]);
  if (now === null || then === null) return null;

  // A reading exists today only if some snapshot predates today's start.
  const earliest = await prisma.viewSnapshot.findFirst({
    where: { video: { userId }, capturedAt: { lte: startOfDay } },
    select: { id: true },
  });
  if (!earliest) return null;

  return now - then;
}

export type Mover = {
  id: string;
  platform: Platform;
  title: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  views: number;
  delta: number;
};

/**
 * Biggest movers: per video, views gained across the window.
 *
 * The baseline is the last reading at or *before* the window opens, so a video
 * last synced before the window still reports the views it gained during it. We
 * only fall back to the earliest in-window reading when no earlier one exists
 * (a video first seen mid-window), where the true baseline is unknowable.
 */
export async function getBiggestMovers(
  userId: string,
  window: Window,
  limit = 5,
): Promise<Mover[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      platform: Platform;
      title: string;
      thumbnailUrl: string | null;
      permalink: string | null;
      views: bigint;
      delta: bigint;
    }[]
  >`
    WITH mine AS (
      SELECT s."videoId", s."capturedAt", s.views
      FROM "ViewSnapshot" s
      JOIN "Video" v ON v.id = s."videoId"
      WHERE v."userId" = ${userId} AND s."capturedAt" <= ${window.end}
    ),
    -- Latest reading in the window: the "now" end of the delta.
    last_reading AS (
      SELECT DISTINCT ON ("videoId") "videoId", views
      FROM mine
      WHERE (${window.start}::timestamptz IS NULL OR "capturedAt" >= ${window.start})
      ORDER BY "videoId", "capturedAt" DESC
    ),
    -- Preferred baseline: the last reading taken before the window opened.
    baseline_before AS (
      SELECT DISTINCT ON ("videoId") "videoId", views
      FROM mine
      WHERE ${window.start}::timestamptz IS NOT NULL AND "capturedAt" < ${window.start}
      ORDER BY "videoId", "capturedAt" DESC
    ),
    -- Fallback for videos first seen inside the window.
    baseline_within AS (
      SELECT DISTINCT ON ("videoId") "videoId", views
      FROM mine
      WHERE (${window.start}::timestamptz IS NULL OR "capturedAt" >= ${window.start})
      ORDER BY "videoId", "capturedAt" ASC
    )
    SELECT v.id, v.platform, v.title, v."thumbnailUrl", v.permalink,
           v."currentViews" AS views,
           (l.views - COALESCE(b.views, w.views)) AS delta
    FROM last_reading l
    JOIN baseline_within w ON w."videoId" = l."videoId"
    LEFT JOIN baseline_before b ON b."videoId" = l."videoId"
    JOIN "Video" v ON v.id = l."videoId"
    WHERE l.views > COALESCE(b.views, w.views)
    ORDER BY delta DESC, v."currentViews" DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    permalink: r.permalink,
    views: Number(r.views),
    delta: Number(r.delta),
  }));
}
