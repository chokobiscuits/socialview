import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.TOKEN_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

import { assertDisposableDatabase } from "@/services/sync/test-guard";
assertDisposableDatabase();

import { prisma } from "@/lib/db";
import { resolveWindow } from "@/lib/ranges";
import {
  countBuckets,
  getViewsSeries,
  getTotalAt,
  getPeriodChange,
  getViewsToday,
  getBiggestMovers,
} from "./timeseries";

/**
 * Hand-built snapshot history with known values, so every derived number can be
 * checked against arithmetic done on paper.
 */

const NOW = new Date("2026-07-09T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600e3);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600e3);

let userId: string;
let videoA: string;
let videoB: string;

async function seed() {
  const user = await prisma.user.create({
    data: { email: `ts${Date.now()}@example.com` },
  });
  userId = user.id;
  const conn = await prisma.platformConnection.create({
    data: {
      userId,
      platform: "YOUTUBE",
      externalAccountId: `UC_${Date.now()}`,
      accessTokenEnc: "v1:x:y:z",
    },
  });
  const mk = async (externalId: string, title: string, current: number) =>
    (
      await prisma.video.create({
        data: {
          userId,
          connectionId: conn.id,
          platform: "YOUTUBE",
          externalId,
          title,
          currentViews: BigInt(current),
        },
        select: { id: true },
      })
    ).id;

  videoA = await mk("a", "Video A", 1000);
  videoB = await mk("b", "Video B", 500);
}

async function snap(videoId: string, at: Date, views: number) {
  await prisma.viewSnapshot.create({
    data: { videoId, capturedAt: at, views: BigInt(views) },
  });
}

beforeEach(async () => {
  await prisma.viewSnapshot.deleteMany();
  await prisma.video.deleteMany();
  await prisma.platformConnection.deleteMany();
  await prisma.user.deleteMany();
  await seed();
});

after(async () => {
  await prisma.viewSnapshot.deleteMany();
  await prisma.video.deleteMany();
  await prisma.platformConnection.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

const win30 = () => resolveWindow("30d", NOW);

describe("countBuckets: the honesty gate", () => {
  test("zero when nothing has been captured", async () => {
    assert.equal(await countBuckets(userId, win30()), 0);
  });

  test("one after a single sync, which is why charts must show 'collecting data'", async () => {
    await snap(videoA, hoursAgo(1), 1000);
    await snap(videoB, hoursAgo(1), 500);
    assert.equal(await countBuckets(userId, win30()), 1, "two videos, one bucket");
  });

  test("counts distinct hours, not rows", async () => {
    await snap(videoA, hoursAgo(2), 900);
    await snap(videoB, hoursAgo(2), 400);
    await snap(videoA, hoursAgo(1), 1000);
    assert.equal(await countBuckets(userId, win30()), 2);
  });
});

describe("getViewsSeries", () => {
  test("sums across videos per bucket, ordered ascending", async () => {
    await snap(videoA, hoursAgo(2), 900);
    await snap(videoB, hoursAgo(2), 400);
    await snap(videoA, hoursAgo(1), 1000);
    await snap(videoB, hoursAgo(1), 500);

    const series = await getViewsSeries(userId, win30());
    assert.equal(series.length, 2);
    assert.deepEqual(series.map((p) => p.views), [1300, 1500]);
    assert.ok(series[0].t < series[1].t, "ascending");
  });

  test("filters by platform", async () => {
    await snap(videoA, hoursAgo(1), 1000);
    assert.equal((await getViewsSeries(userId, win30(), "YOUTUBE")).length, 1);
    assert.equal((await getViewsSeries(userId, win30(), "TIKTOK")).length, 0);
  });

  test("excludes snapshots outside the window", async () => {
    await snap(videoA, daysAgo(40), 100); // older than 30d
    await snap(videoA, hoursAgo(1), 1000);
    const series = await getViewsSeries(userId, win30());
    assert.equal(series.length, 1, "the 40-day-old reading is out of range");
  });
});

describe("getTotalAt", () => {
  test("null when no reading exists by that time", async () => {
    assert.equal(await getTotalAt(userId, NOW), null);
  });

  test("takes each video's latest reading at or before the instant", async () => {
    await snap(videoA, hoursAgo(3), 900);
    await snap(videoA, hoursAgo(1), 1000); // newer wins
    await snap(videoB, hoursAgo(3), 400);
    assert.equal(await getTotalAt(userId, NOW), 1400);
  });

  test("ignores readings after the instant", async () => {
    await snap(videoA, hoursAgo(3), 900);
    await snap(videoA, hoursAgo(1), 1000);
    assert.equal(await getTotalAt(userId, hoursAgo(2)), 900);
  });
});

describe("getPeriodChange", () => {
  test("null with no history, rather than a fake 0%", async () => {
    assert.equal(await getPeriodChange(userId, win30()), null);
  });

  test("null when the previous period has no growth to compare against", async () => {
    await snap(videoA, hoursAgo(1), 1000);
    assert.equal(await getPeriodChange(userId, win30()), null);
  });

  test("computes growth against the preceding period of equal length", async () => {
    const w = win30();
    // previousStart(-60d)=100, start(-30d)=200, end(now)=400
    // previous period gained 100; current gained 200; change = +100%
    await snap(videoA, w.previousStart!, 100);
    await snap(videoA, w.start!, 200);
    await snap(videoA, hoursAgo(1), 400);

    const change = await getPeriodChange(userId, w);
    assert.ok(change);
    assert.equal(change.previous, 100);
    assert.equal(change.current, 200);
    assert.equal(Math.round(change.percent), 100);
  });

  test("all-time range has no previous period", async () => {
    await snap(videoA, hoursAgo(1), 1000);
    assert.equal(await getPeriodChange(userId, resolveWindow("all", NOW)), null);
  });
});

describe("getViewsToday", () => {
  test("null when there is no reading from before today started", async () => {
    await snap(videoA, new Date(), 1000);
    assert.equal(await getViewsToday(userId), null, "no baseline -> show a dash");
  });

  test("difference between now and the start of day", async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    await snap(videoA, new Date(startOfDay.getTime() - 3600e3), 1000);
    await snap(videoA, new Date(), 1142);
    assert.equal(await getViewsToday(userId), 142);
  });
});

describe("getBiggestMovers", () => {
  test("empty when there is only one reading", async () => {
    await snap(videoA, hoursAgo(1), 1000);
    assert.deepEqual(await getBiggestMovers(userId, win30()), []);
  });

  test("ranks by views gained inside the window, not by total views", async () => {
    // A is bigger overall but barely moved; B is smaller but surging.
    await snap(videoA, hoursAgo(5), 990);
    await snap(videoA, hoursAgo(1), 1000); // +10
    await snap(videoB, hoursAgo(5), 100);
    await snap(videoB, hoursAgo(1), 500); // +400

    const movers = await getBiggestMovers(userId, win30());
    assert.equal(movers.length, 2);
    assert.equal(movers[0].title, "Video B", "the climber outranks the giant");
    assert.equal(movers[0].delta, 400);
    assert.equal(movers[1].delta, 10);
  });

  test("omits videos that did not move", async () => {
    await snap(videoA, hoursAgo(5), 1000);
    await snap(videoA, hoursAgo(1), 1000); // flat
    await snap(videoB, hoursAgo(5), 100);
    await snap(videoB, hoursAgo(1), 500);

    const movers = await getBiggestMovers(userId, win30());
    assert.equal(movers.length, 1);
    assert.equal(movers[0].title, "Video B");
  });

  test("baselines against the last reading before the window, not the first inside it", async () => {
    // 900 views 35 days ago (outside the window), 1000 now. The video really
    // did gain 100 views during the last 30 days, even though only one reading
    // falls inside the window.
    await snap(videoA, daysAgo(40), 0);
    await snap(videoA, daysAgo(35), 900);
    await snap(videoA, hoursAgo(1), 1000);

    const movers = await getBiggestMovers(userId, win30());
    assert.equal(movers.length, 1);
    assert.equal(movers[0].delta, 100, "the +900 earned before the window is excluded");
  });

  test("falls back to the earliest in-window reading for a video first seen mid-window", async () => {
    // No reading precedes the window, so its true baseline is unknowable; the
    // best available answer is its first sighting.
    await snap(videoB, hoursAgo(5), 100);
    await snap(videoB, hoursAgo(1), 500);

    const movers = await getBiggestMovers(userId, win30());
    assert.equal(movers.length, 1);
    assert.equal(movers[0].delta, 400);
  });

  test("honors the limit", async () => {
    await snap(videoA, hoursAgo(5), 1);
    await snap(videoA, hoursAgo(1), 100);
    await snap(videoB, hoursAgo(5), 1);
    await snap(videoB, hoursAgo(1), 50);
    assert.equal((await getBiggestMovers(userId, win30(), 1)).length, 1);
  });
});
