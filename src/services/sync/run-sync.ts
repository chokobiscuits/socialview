import pLimit from "p-limit";
import type { PlatformConnection } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { adapterFor } from "../registry";
import { TokenRevokedError } from "../types";
import { getAccessToken, markNeedsReauth } from "./token-manager";
import { bucketToHour } from "./bucket";

/** Sync several connections at once, but do not hammer any single platform. */
const CONNECTION_CONCURRENCY = 4;

export type ConnectionResult =
  | { connectionId: string; platform: string; ok: true; videos: number }
  | { connectionId: string; platform: string; ok: false; error: string; needsReauth: boolean };

export type SyncSummary = {
  synced: number;
  failed: number;
  capturedAt: string;
  details: ConnectionResult[];
};

/** Exported for tests. Sync one connection; never throws past this boundary. */
export async function syncConnection(
  connection: PlatformConnection,
  capturedAt: Date,
): Promise<ConnectionResult> {
  const base = { connectionId: connection.id, platform: connection.platform };

  let accessToken: string;
  try {
    accessToken = await getAccessToken(connection);
  } catch (e) {
    const revoked = e instanceof TokenRevokedError;
    const message = e instanceof Error ? e.message : String(e);
    if (revoked) await markNeedsReauth(connection.id, message);
    return { ...base, ok: false, error: message, needsReauth: revoked };
  }

  const adapter = adapterFor(connection.platform);
  let count = 0;

  try {
    for await (const dto of adapter.fetchVideoStats({
      connectionId: connection.id,
      externalAccountId: connection.externalAccountId,
      accessToken,
    })) {
      const stats = {
        currentViews: BigInt(dto.views),
        currentLikes: BigInt(dto.likes ?? 0),
        currentComments: BigInt(dto.comments ?? 0),
      };

      // Upsert the video, then append a snapshot, atomically. The unique key
      // (platform, externalId) makes re-running a sync idempotent.
      const video = await prisma.video.upsert({
        where: {
          platform_externalId: {
            platform: connection.platform,
            externalId: dto.externalId,
          },
        },
        create: {
          userId: connection.userId,
          connectionId: connection.id,
          platform: connection.platform,
          externalId: dto.externalId,
          title: dto.title,
          thumbnailUrl: dto.thumbnailUrl,
          permalink: dto.permalink,
          publishedAt: dto.publishedAt,
          statsUpdatedAt: capturedAt,
          ...stats,
        },
        update: {
          title: dto.title,
          thumbnailUrl: dto.thumbnailUrl,
          permalink: dto.permalink,
          publishedAt: dto.publishedAt,
          statsUpdatedAt: capturedAt,
          ...stats,
        },
        select: { id: true },
      });

      // Upsert, not create: two syncs in the same hour must leave one reading
      // for that hour, or the time series double-counts.
      const reading = {
        views: stats.currentViews,
        likes: stats.currentLikes,
        comments: stats.currentComments,
      };
      await prisma.viewSnapshot.upsert({
        where: { videoId_capturedAt: { videoId: video.id, capturedAt } },
        create: { videoId: video.id, capturedAt, ...reading },
        update: reading,
      });
      count++;
    }
  } catch (e) {
    const revoked = e instanceof TokenRevokedError;
    const message = e instanceof Error ? e.message : String(e);
    if (revoked) await markNeedsReauth(connection.id, message);
    else {
      await prisma.platformConnection.update({
        where: { id: connection.id },
        data: { lastSyncError: message.slice(0, 1000) },
      });
    }
    return { ...base, ok: false, error: message, needsReauth: revoked };
  }

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  return { ...base, ok: true, videos: count };
}

/**
 * Sync every active connection. Failures are isolated per connection: a dead
 * TikTok token must never stop YouTube from updating.
 *
 * Pass a userId to sync only that user's connections (the "Sync now" button).
 */
export async function runSync(userId?: string): Promise<SyncSummary> {
  const capturedAt = bucketToHour();
  const connections = await prisma.platformConnection.findMany({
    where: { status: "ACTIVE", ...(userId ? { userId } : {}) },
  });

  const limit = pLimit(CONNECTION_CONCURRENCY);
  const settled = await Promise.allSettled(
    connections.map((c) => limit(() => syncConnection(c, capturedAt))),
  );

  const details: ConnectionResult[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          connectionId: connections[i].id,
          platform: connections[i].platform,
          ok: false as const,
          error: String(s.reason),
          needsReauth: false,
        },
  );

  return {
    synced: details.filter((d) => d.ok).length,
    failed: details.filter((d) => !d.ok).length,
    capturedAt: capturedAt.toISOString(),
    details,
  };
}
