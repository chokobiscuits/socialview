import "server-only";
import { prisma } from "@/lib/db";
import type { Platform } from "@/lib/platforms";
import { PLATFORMS } from "@/lib/platforms";
import type { Sort } from "@/lib/video-sort";
import type { Window } from "@/lib/ranges";
import type { SeriesPoint } from "./timeseries";

export { parseSort } from "@/lib/video-sort";
export type { Sort } from "@/lib/video-sort";

/** Narrow an untrusted ?platform= to a real platform, or null for "all". */
export function parsePlatform(
  raw: string | string[] | undefined,
): Platform | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return PLATFORMS.includes(v as Platform) ? (v as Platform) : null;
}

const ORDER_BY: Record<Sort, Record<string, "asc" | "desc">> = {
  views: { currentViews: "desc" },
  likes: { currentLikes: "desc" },
  newest: { publishedAt: "desc" },
  oldest: { publishedAt: "asc" },
};

export type VideoRow = {
  id: string;
  platform: Platform;
  title: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  views: number;
  likes: number;
  comments: number;
  channel: string | null;
};

export async function getVideos(
  userId: string,
  opts: {
    query?: string;
    platform?: Platform | null;
    sort?: Sort;
    limit?: number;
  } = {},
): Promise<VideoRow[]> {
  const { query, platform, sort = "views", limit } = opts;

  const rows = await prisma.video.findMany({
    where: {
      userId,
      ...(platform ? { platform } : {}),
      // Case-insensitive substring match on the title.
      ...(query
        ? { title: { contains: query, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: ORDER_BY[sort],
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
      platform: true,
      title: true,
      thumbnailUrl: true,
      permalink: true,
      publishedAt: true,
      currentViews: true,
      currentLikes: true,
      currentComments: true,
      connection: { select: { displayName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    platform: r.platform as Platform,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    permalink: r.permalink,
    publishedAt: r.publishedAt,
    views: Number(r.currentViews),
    likes: Number(r.currentLikes),
    comments: Number(r.currentComments),
    channel: r.connection.displayName,
  }));
}

/**
 * One video, scoped to its owner so a guessed id from another account 404s
 * rather than leaking. Null when it does not exist or is not theirs.
 */
export async function getVideoDetail(
  userId: string,
  videoId: string,
): Promise<VideoRow | null> {
  const r = await prisma.video.findFirst({
    where: { id: videoId, userId },
    select: {
      id: true,
      platform: true,
      title: true,
      thumbnailUrl: true,
      permalink: true,
      publishedAt: true,
      currentViews: true,
      currentLikes: true,
      currentComments: true,
      connection: { select: { displayName: true } },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    platform: r.platform as Platform,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    permalink: r.permalink,
    publishedAt: r.publishedAt,
    views: Number(r.currentViews),
    likes: Number(r.currentLikes),
    comments: Number(r.currentComments),
    channel: r.connection.displayName,
  };
}

/**
 * View history for a single video, one point per hourly snapshot bucket. Same
 * snapshot-diffing basis as the account-wide series in timeseries.ts; ownership
 * is enforced by joining through Video on userId.
 */
export async function getVideoSeries(
  userId: string,
  videoId: string,
  window: Window,
): Promise<SeriesPoint[]> {
  const rows = await prisma.$queryRaw<{ t: Date; views: bigint }[]>`
    SELECT s."capturedAt" AS t, s.views AS views
    FROM "ViewSnapshot" s
    JOIN "Video" v ON v.id = s."videoId"
    WHERE v."userId" = ${userId}
      AND s."videoId" = ${videoId}
      AND (${window.start}::timestamptz IS NULL OR s."capturedAt" >= ${window.start})
      AND s."capturedAt" <= ${window.end}
    ORDER BY s."capturedAt" ASC
  `;
  return rows.map((r) => ({ t: r.t, views: Number(r.views) }));
}
