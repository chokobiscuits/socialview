import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostingCalendar } from "@/components/calendar/posting-calendar";
import type { Platform } from "@/lib/platforms";

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const videos = await prisma.video.findMany({
    where: { userId: session.user.id, publishedAt: { not: null } },
    select: {
      id: true,
      title: true,
      platform: true,
      permalink: true,
      publishedAt: true,
      currentViews: true,
    },
    orderBy: { publishedAt: "desc" },
  });

  const posts = videos.map((v) => ({
    id: v.id,
    title: v.title,
    platform: v.platform as Platform,
    permalink: v.permalink,
    publishedAt: v.publishedAt!.toISOString(),
    views: Number(v.currentViews),
  }));

  return (
    <>
      <header className="pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When you posted, across every platform.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border py-24 text-sm text-muted-foreground">
          No posts yet. Connect a platform and run a sync.
        </div>
      ) : (
        <PostingCalendar posts={posts} />
      )}
    </>
  );
}
