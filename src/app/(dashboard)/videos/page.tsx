import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { VideosTable } from "@/components/videos/videos-table";
import { VideosToolbar } from "@/components/videos/videos-toolbar";
import { getVideos, parseSort, parsePlatform } from "@/server/queries/videos";
import { getPlatformSummaries } from "@/server/queries/summary";

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const platform = parsePlatform(sp.platform);
  const query = typeof sp.q === "string" ? sp.q : "";

  const [videos, summaries] = await Promise.all([
    getVideos(userId, { query, platform, sort }),
    getPlatformSummaries(userId),
  ]);

  const multiChannel = summaries.some((s) => s.channels > 1);

  return (
    <>
      <header className="pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">All Videos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {videos.length} {videos.length === 1 ? "video" : "videos"} across every
          connected channel
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card p-5">
        <VideosToolbar
          query={query}
          platform={platform}
          sort={sort}
          platforms={summaries.map((s) => s.platform)}
        />
        <div className="mt-4">
          <VideosTable videos={videos} showChannel={multiChannel} />
        </div>
      </div>
    </>
  );
}
