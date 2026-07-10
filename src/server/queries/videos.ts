import "server-only";
import { prisma } from "@/lib/db";
import type { Platform } from "@/lib/platforms";
import { PLATFORMS } from "@/lib/platforms";
import type { Sort } from "@/lib/video-sort";

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
