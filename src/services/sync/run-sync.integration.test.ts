import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.TOKEN_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.GOOGLE_CLIENT_ID ??= "test";
process.env.GOOGLE_CLIENT_SECRET ??= "test";

import { assertDisposableDatabase } from "./test-guard";

// Runs at import time, before any beforeEach can truncate a real database.
assertDisposableDatabase();

import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/crypto";
import { ADAPTERS } from "../registry";
import { TokenRevokedError, type PlatformAdapter, type VideoStatDTO } from "../types";
import { syncConnection, runSync } from "./run-sync";

/**
 * Exercises the sync job against the real database. The adapter is swapped for
 * a fake so we control what "the platform" returns, but every upsert, snapshot
 * write, and status transition is real.
 */

const realYouTube = ADAPTERS.YOUTUBE;

function fakeAdapter(
  videos: VideoStatDTO[],
  opts: { throwOn?: "refresh" | "fetch"; error?: Error } = {},
): PlatformAdapter {
  return {
    platform: "YOUTUBE",
    authorizeUrl: () => "https://example.test/auth",
    exchangeCode: async () => {
      throw new Error("unused");
    },
    refresh: async () => {
      if (opts.throwOn === "refresh") throw opts.error;
      return { accessToken: "refreshed-at", accessExpiresAt: new Date(Date.now() + 3600e3) };
    },
    async *fetchVideoStats() {
      if (opts.throwOn === "fetch") throw opts.error;
      for (const v of videos) yield v;
    },
  };
}

const FAR_FUTURE = new Date(Date.now() + 3600e3);
let userId: string;
let connectionId: string;

async function seedConnection(accessExpiresAt = FAR_FUTURE) {
  const user = await prisma.user.create({
    data: { email: `t${Date.now()}@example.com`, name: "Tester" },
  });
  userId = user.id;
  const conn = await prisma.platformConnection.create({
    data: {
      userId,
      platform: "YOUTUBE",
      externalAccountId: `UC_${Date.now()}`,
      accessTokenEnc: encryptToken("access-token"),
      refreshTokenEnc: encryptToken("refresh-token"),
      accessExpiresAt,
      status: "ACTIVE",
    },
  });
  connectionId = conn.id;
  return conn;
}

const VIDEO: VideoStatDTO = {
  externalId: "vid_1",
  title: "I Tried Living in -20C",
  thumbnailUrl: "https://i.ytimg.com/x.jpg",
  permalink: "https://www.youtube.com/watch?v=vid_1",
  publishedAt: new Date("2026-07-07T10:00:00Z"),
  views: 1_240_443,
  likes: 62_100,
  comments: 2_100,
};

beforeEach(async () => {
  await prisma.viewSnapshot.deleteMany();
  await prisma.video.deleteMany();
  await prisma.platformConnection.deleteMany();
  await prisma.user.deleteMany();
});

after(async () => {
  ADAPTERS.YOUTUBE = realYouTube;
  await prisma.viewSnapshot.deleteMany();
  await prisma.video.deleteMany();
  await prisma.platformConnection.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("syncConnection", () => {
  test("writes a video and one snapshot", async () => {
    const conn = await seedConnection();
    ADAPTERS.YOUTUBE = fakeAdapter([VIDEO]);

    const at = new Date("2026-07-09T14:00:00Z");
    const result = await syncConnection(conn, at);

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.videos, 1);

    const video = await prisma.video.findFirstOrThrow();
    assert.equal(video.title, VIDEO.title);
    assert.equal(video.currentViews, 1_240_443n);
    assert.equal(video.permalink, VIDEO.permalink);

    const snaps = await prisma.viewSnapshot.findMany();
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].views, 1_240_443n);
    assert.equal(snaps[0].capturedAt.toISOString(), at.toISOString());
  });

  test("is idempotent: re-syncing updates the video, appends a snapshot", async () => {
    const conn = await seedConnection();

    ADAPTERS.YOUTUBE = fakeAdapter([VIDEO]);
    await syncConnection(conn, new Date("2026-07-09T14:00:00Z"));

    // An hour later the video gained views.
    ADAPTERS.YOUTUBE = fakeAdapter([{ ...VIDEO, views: 1_252_884 }]);
    await syncConnection(conn, new Date("2026-07-09T15:00:00Z"));

    assert.equal(await prisma.video.count(), 1, "no duplicate video");
    assert.equal(await prisma.viewSnapshot.count(), 2, "history accumulates");

    const video = await prisma.video.findFirstOrThrow();
    assert.equal(video.currentViews, 1_252_884n, "denormalized total updated");

    const snaps = await prisma.viewSnapshot.findMany({ orderBy: { capturedAt: "asc" } });
    assert.deepEqual(
      snaps.map((s) => s.views),
      [1_240_443n, 1_252_884n],
      "the delta between snapshots is what drives '+12,441 today'",
    );
  });

  test("two syncs in the SAME hour overwrite that hour's reading, not duplicate it", async () => {
    const conn = await seedConnection();
    const sameHour = new Date("2026-07-09T14:00:00Z");

    ADAPTERS.YOUTUBE = fakeAdapter([VIDEO]);
    await syncConnection(conn, sameHour);

    // A manual "sync now", or a cron retry, minutes later.
    ADAPTERS.YOUTUBE = fakeAdapter([{ ...VIDEO, views: 1_240_500 }]);
    await syncConnection(conn, sameHour);

    const snaps = await prisma.viewSnapshot.findMany();
    assert.equal(snaps.length, 1, "one reading per (video, hour)");
    assert.equal(snaps[0].views, 1_240_500n, "and it holds the latest value");
  });

  test("marks NEEDS_REAUTH when the grant is revoked, without throwing", async () => {
    // Force a refresh by expiring the access token.
    const conn = await seedConnection(new Date(Date.now() - 1000));
    ADAPTERS.YOUTUBE = fakeAdapter([], {
      throwOn: "refresh",
      error: new TokenRevokedError("YOUTUBE", "Refresh token revoked or expired"),
    });

    const result = await syncConnection(conn, new Date());
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.needsReauth, true);

    const after = await prisma.platformConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    assert.equal(after.status, "NEEDS_REAUTH");
    assert.match(after.lastSyncError ?? "", /revoked/i);
  });

  test("a mid-fetch API failure records the error but leaves status ACTIVE", async () => {
    const conn = await seedConnection();
    ADAPTERS.YOUTUBE = fakeAdapter([], {
      throwOn: "fetch",
      error: new Error("500 Internal Server Error"),
    });

    const result = await syncConnection(conn, new Date());
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.needsReauth, false);

    const after = await prisma.platformConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    assert.equal(after.status, "ACTIVE", "a transient 500 must not force re-consent");
    assert.match(after.lastSyncError ?? "", /500/);
  });

  test("a successful sync clears a previous error and stamps lastSyncedAt", async () => {
    const conn = await seedConnection();
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: { lastSyncError: "previous failure" },
    });

    ADAPTERS.YOUTUBE = fakeAdapter([VIDEO]);
    await syncConnection(
      await prisma.platformConnection.findUniqueOrThrow({ where: { id: conn.id } }),
      new Date(),
    );

    const after = await prisma.platformConnection.findUniqueOrThrow({
      where: { id: conn.id },
    });
    assert.equal(after.lastSyncError, null);
    assert.ok(after.lastSyncedAt);
  });

  test("refreshing a near-expiry token persists the new ciphertext", async () => {
    const conn = await seedConnection(new Date(Date.now() + 60_000)); // inside 5-min window
    ADAPTERS.YOUTUBE = fakeAdapter([VIDEO]);

    const before = conn.accessTokenEnc;
    await syncConnection(conn, new Date());

    const after = await prisma.platformConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    assert.notEqual(after.accessTokenEnc, before, "token was rotated");
    assert.ok(after.accessTokenEnc.startsWith("v1:"), "and stored encrypted");
    assert.ok(!after.accessTokenEnc.includes("refreshed-at"), "never plaintext");
  });
});

describe("runSync failure isolation", () => {
  test("one dead connection does not stop the others", async () => {
    // Two users, each with a YouTube connection: the unique constraint is
    // (userId, platform), so this is the realistic multi-tenant shape.
    const good = await seedConnection();
    const badUser = await prisma.user.create({
      data: { email: `bad${Date.now()}@example.com` },
    });
    const bad = await prisma.platformConnection.create({
      data: {
        userId: badUser.id,
        platform: "YOUTUBE",
        externalAccountId: `UC_bad_${Date.now()}`,
        accessTokenEnc: encryptToken("at"),
        refreshTokenEnc: encryptToken("rt"),
        accessExpiresAt: new Date(Date.now() - 1000), // forces a refresh
        status: "ACTIVE",
      },
    });

    // The fake throws only when refreshing, which only `bad` needs.
    ADAPTERS.YOUTUBE = {
      ...fakeAdapter([VIDEO]),
      refresh: async () => {
        throw new TokenRevokedError("YOUTUBE", "revoked");
      },
    };

    const summary = await runSync();

    assert.equal(summary.synced, 1, "the healthy connection still synced");
    assert.equal(summary.failed, 1, "the dead one is reported, not swallowed");

    const goodAfter = await prisma.platformConnection.findUniqueOrThrow({
      where: { id: good.id },
    });
    const badAfter = await prisma.platformConnection.findUniqueOrThrow({
      where: { id: bad.id },
    });
    assert.equal(goodAfter.status, "ACTIVE");
    assert.equal(badAfter.status, "NEEDS_REAUTH");
    assert.equal(await prisma.video.count(), 1, "the healthy connection wrote data");
  });

  test("skips connections that are not ACTIVE", async () => {
    const conn = await seedConnection();
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: { status: "NEEDS_REAUTH" },
    });
    ADAPTERS.YOUTUBE = fakeAdapter([VIDEO]);

    const summary = await runSync();
    assert.equal(summary.synced, 0);
    assert.equal(summary.failed, 0);
    assert.equal(await prisma.video.count(), 0);
  });

  test("one user can connect several channels on the same platform", async () => {
    const first = await seedConnection();
    const second = await prisma.platformConnection.create({
      data: {
        userId, // same user
        platform: "YOUTUBE",
        externalAccountId: "UC_second_channel",
        displayName: "Second channel",
        accessTokenEnc: encryptToken("at2"),
        refreshTokenEnc: encryptToken("rt2"),
        accessExpiresAt: FAR_FUTURE,
        status: "ACTIVE",
      },
    });
    assert.notEqual(first.id, second.id);

    // Each channel returns its own video.
    let call = 0;
    ADAPTERS.YOUTUBE = {
      ...fakeAdapter([]),
      async *fetchVideoStats() {
        call++;
        yield { ...VIDEO, externalId: `chan${call}_vid`, views: 100 * call };
      },
    };

    const summary = await runSync(userId);
    assert.equal(summary.synced, 2, "both channels synced");
    assert.equal(await prisma.video.count(), 2, "videos from both channels");

    // Videos are attributable to the channel they came from.
    const videos = await prisma.video.findMany({ select: { connectionId: true } });
    assert.equal(new Set(videos.map((v) => v.connectionId)).size, 2);
  });

  test("the same real channel cannot be claimed twice", async () => {
    await seedConnection();
    const dupe = prisma.platformConnection.create({
      data: {
        userId,
        platform: "YOUTUBE",
        externalAccountId: (
          await prisma.platformConnection.findFirstOrThrow()
        ).externalAccountId,
        accessTokenEnc: encryptToken("x"),
      },
    });
    await assert.rejects(() => dupe, /Unique constraint/i);
  });

  test("all snapshots in one run share a single capturedAt", async () => {
    await seedConnection();
    ADAPTERS.YOUTUBE = fakeAdapter([
      VIDEO,
      { ...VIDEO, externalId: "vid_2", title: "Second" },
      { ...VIDEO, externalId: "vid_3", title: "Third" },
    ]);

    await runSync();

    const snaps = await prisma.viewSnapshot.findMany();
    assert.equal(snaps.length, 3);
    const stamps = new Set(snaps.map((s) => s.capturedAt.getTime()));
    assert.equal(stamps.size, 1, "one bucket, so GROUP BY capturedAt works");
  });
});
