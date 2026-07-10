import "server-only";
import { prisma } from "@/lib/db";
import type { Platform } from "@/lib/platforms";

/**
 * "Now" values. These read the denormalized Video.currentViews, refreshed on
 * every sync, so they need no snapshot history and work from the first sync.
 *
 * BigInt cannot be serialized across the RSC boundary, so everything is
 * narrowed to Number here. View counts stay far below 2^53.
 */

export type PlatformSummary = {
  platform: Platform;
  views: number;
  videos: number;
  channels: number;
};

export async function getTotalViews(userId: string): Promise<number> {
  const agg = await prisma.video.aggregate({
    where: { userId },
    _sum: { currentViews: true },
  });
  return Number(agg._sum.currentViews ?? 0n);
}

/** Per-platform totals, aggregated across every channel on that platform. */
export async function getPlatformSummaries(
  userId: string,
): Promise<PlatformSummary[]> {
  const [videoAgg, connAgg] = await Promise.all([
    prisma.video.groupBy({
      by: ["platform"],
      where: { userId },
      _sum: { currentViews: true },
      _count: { _all: true },
    }),
    prisma.platformConnection.groupBy({
      by: ["platform"],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  const channels = new Map(connAgg.map((c) => [c.platform, c._count._all]));

  // Only surface platforms the user has actually connected.
  return connAgg.map((c) => {
    const v = videoAgg.find((x) => x.platform === c.platform);
    return {
      platform: c.platform as Platform,
      views: Number(v?._sum.currentViews ?? 0n),
      videos: v?._count._all ?? 0,
      channels: channels.get(c.platform) ?? 0,
    };
  });
}

export type TopVideo = {
  id: string;
  platform: Platform;
  title: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  views: number;
};

/** Served by the (userId, currentViews) index. */
export async function getTopVideos(
  userId: string,
  limit = 5,
): Promise<TopVideo[]> {
  const rows = await prisma.video.findMany({
    where: { userId },
    orderBy: { currentViews: "desc" },
    take: limit,
    select: {
      id: true,
      platform: true,
      title: true,
      thumbnailUrl: true,
      permalink: true,
      currentViews: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform as Platform,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    permalink: r.permalink,
    views: Number(r.currentViews),
  }));
}

/** The most recent sync across all of the user's connections. */
export async function getLastSyncedAt(userId: string): Promise<Date | null> {
  const agg = await prisma.platformConnection.aggregate({
    where: { userId },
    _max: { lastSyncedAt: true },
  });
  return agg._max.lastSyncedAt;
}

export async function getConnectionCount(userId: string): Promise<number> {
  return prisma.platformConnection.count({ where: { userId } });
}
