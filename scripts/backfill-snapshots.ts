import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * DEVELOPMENT ONLY. Synthesizes hourly ViewSnapshot history working backwards
 * from each video's real current view count, so the charts have something to
 * draw before enough real hours have elapsed.
 *
 * It only ever INSERTS into ViewSnapshot, and only for buckets that do not
 * already exist. Video rows, connections, and the real "now" totals are never
 * modified, so the dashboard's headline numbers stay truthful.
 *
 *   npm run db:backfill        # add 24 hours of history
 *   npm run db:backfill -- --undo   # remove every synthetic bucket
 *
 * "Synthetic" means: any snapshot older than the newest real one. The newest
 * bucket is always the genuine reading written by a sync.
 */

const HOURS = 24;

function client() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  if (!/localhost|127\.0\.0\.1/.test(connectionString)) {
    throw new Error("Refusing to backfill a non-local database");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function bucketToHour(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

async function main() {
  const prisma = client();
  const undo = process.argv.includes("--undo");

  const newest = await prisma.viewSnapshot.aggregate({ _max: { capturedAt: true } });
  const realBucket = newest._max.capturedAt;
  if (!realBucket) {
    console.log("No snapshots at all. Run a sync first.");
    return prisma.$disconnect();
  }

  if (undo) {
    const { count } = await prisma.viewSnapshot.deleteMany({
      where: { capturedAt: { lt: realBucket } },
    });
    console.log(`Removed ${count} synthetic snapshots. Kept the real bucket at ${realBucket.toISOString()}.`);
    return prisma.$disconnect();
  }

  const videos = await prisma.video.findMany({
    select: { id: true, title: true, currentViews: true, currentLikes: true, currentComments: true },
  });
  if (videos.length === 0) {
    console.log("No videos. Connect a channel and sync first.");
    return prisma.$disconnect();
  }

  let created = 0;
  for (const v of videos) {
    const current = Number(v.currentViews);
    const likes = Number(v.currentLikes);
    const comments = Number(v.currentComments);

    // Walk backwards, shedding a small random fraction each hour so the curve
    // rises toward the real present value rather than being flat.
    let views = current;
    for (let h = 1; h <= HOURS; h++) {
      const at = bucketToHour(new Date(realBucket.getTime() - h * 3600e3));
      // Between 0.4% and 2.2% fewer views each hour going back.
      const shrink = 1 - (0.004 + Math.random() * 0.018);
      views = Math.max(0, Math.floor(views * shrink));

      const scale = current > 0 ? views / current : 0;
      await prisma.viewSnapshot.upsert({
        where: { videoId_capturedAt: { videoId: v.id, capturedAt: at } },
        create: {
          videoId: v.id,
          capturedAt: at,
          views: BigInt(views),
          likes: BigInt(Math.floor(likes * scale)),
          comments: BigInt(Math.floor(comments * scale)),
        },
        // Never clobber a real reading that happens to be there.
        update: {},
      });
      created++;
    }
  }

  const buckets = await prisma.viewSnapshot.findMany({
    distinct: ["capturedAt"],
    select: { capturedAt: true },
    orderBy: { capturedAt: "asc" },
  });
  console.log(`Backfilled ${created} snapshot rows across ${videos.length} videos.`);
  console.log(`${buckets.length} hourly buckets now, from ${buckets[0].capturedAt.toISOString()} to ${realBucket.toISOString()}.`);
  console.log(`Undo with: npm run db:backfill -- --undo`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
