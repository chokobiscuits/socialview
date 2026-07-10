import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/layout/topbar";
import { PlatformCard } from "@/components/dashboard/platform-card";
import { TotalViewsCard } from "@/components/dashboard/total-views-card";
import { TopVideos } from "@/components/dashboard/top-videos";
import { VideosTable } from "@/components/videos/videos-table";
import { VideosToolbar } from "@/components/videos/videos-toolbar";
import { parseRange, resolveWindow, RANGE_LABELS } from "@/lib/ranges";
import { PLATFORMS, PLATFORM_META, type Platform } from "@/lib/platforms";
import { isConfigured } from "@/services/registry";
import {
  getTotalViews,
  getPlatformSummaries,
  getTopVideos,
  getLastSyncedAt,
  getConnectionCount,
} from "@/server/queries/summary";
import {
  countBuckets,
  getViewsSeries,
  getPeriodChange,
  getViewsToday,
} from "@/server/queries/timeseries";
import { getVideos, parseSort, parsePlatform } from "@/server/queries/videos";

/** Charts need two readings before they can show anything true. */
const MIN_BUCKETS = 2;

/**
 * Written out in full because Tailwind scans source text for class names and
 * cannot see an interpolated `xl:grid-cols-${n}`. Always four columns at xl, so
 * one connected platform yields one quarter-width card rather than a stretched
 * banner; the empty columns simply read as room for the platforms you add next.
 */
const CARD_COLUMNS = "sm:grid-cols-2 xl:grid-cols-4";

/**
 * Snapshots are hourly. Over a short window every point falls on the same day,
 * so a date label would repeat "Jul 9" across the whole axis; over a long one an
 * hour label is noise. Choose by the span the data actually covers.
 */
function labelsFor(series: { t: Date }[]): (t: Date) => string {
  if (series.length < 2) {
    return (t) => t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const spanMs = series[series.length - 1].t.getTime() - series[0].t.getTime();
  const withinTwoDays = spanMs <= 48 * 3600e3;

  return withinTwoDays
    ? (t) => t.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
    : (t) => t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sp = await searchParams;
  const range = parseRange(sp.range);
  const window = resolveWindow(range);
  const sort = parseSort(sp.sort);
  const platform = parsePlatform(sp.platform);
  const query = typeof sp.q === "string" ? sp.q : "";

  const [
    connections,
    total,
    summaries,
    topVideos,
    lastSyncedAt,
    buckets,
    series,
    change,
    viewsToday,
    videos,
  ] = await Promise.all([
    getConnectionCount(userId),
    getTotalViews(userId),
    getPlatformSummaries(userId),
    getTopVideos(userId, 5),
    getLastSyncedAt(userId),
    countBuckets(userId, window),
    getViewsSeries(userId, window),
    getPeriodChange(userId, window),
    getViewsToday(userId),
    getVideos(userId, { query, platform, sort, limit: 7 }),
  ]);

  if (connections === 0) return <NoConnections range={range} />;

  const hasHistory = buckets >= MIN_BUCKETS;

  // Per-platform sparkline series, fetched only when there is history to draw.
  const sparklines = hasHistory
    ? await Promise.all(
        summaries.map(async (s) => ({
          platform: s.platform,
          series: (await getViewsSeries(userId, window, s.platform)).map((p) => ({
            t: p.t.toISOString(),
            views: p.views,
          })),
        })),
      )
    : [];
  const seriesBy = new Map(sparklines.map((s) => [s.platform, s.series]));

  const label = labelsFor(series);
  const areaData = series.map((p) => ({
    t: p.t.toISOString(),
    label: label(p.t),
    // The axis label is abbreviated; the tooltip should never be ambiguous.
    full: p.t.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      hour12: true,
    }),
    views: p.views,
  }));

  const connectedPlatforms = summaries.map((s) => s.platform);

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Overview of your video performance across all platforms"
        range={range}
        lastSyncedAt={lastSyncedAt}
      />

      <div className={`grid gap-4 ${CARD_COLUMNS}`}>
        {summaries.map((s) => (
          <PlatformCard
            key={s.platform}
            platform={s.platform}
            views={s.views}
            videos={s.videos}
            channels={s.channels}
            series={seriesBy.get(s.platform) ?? []}
            hasHistory={hasHistory && (seriesBy.get(s.platform)?.length ?? 0) >= MIN_BUCKETS}
          />
        ))}
        {/* Platforms you have not connected keep the row whole and give the
            obvious next action, rather than leaving dead space. */}
        {PLATFORMS.filter((p) => !summaries.some((s) => s.platform === p)).map(
          (p) => (
            <UnconnectedPlatformCard key={p} platform={p} />
          ),
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-base font-medium">All Videos</h2>
          </div>

          <div className="mt-4">
            <VideosToolbar
              query={query}
              platform={platform}
              sort={sort}
              platforms={connectedPlatforms}
            />
          </div>

          <div className="mt-4">
            <VideosTable videos={videos} />
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <TotalViewsCard
            total={total}
            change={change}
            viewsToday={viewsToday}
            series={areaData}
            rangeLabel={RANGE_LABELS[range]}
            hasHistory={hasHistory}
          />
          <TopVideos videos={topVideos} />
        </aside>
      </div>
    </>
  );
}

function UnconnectedPlatformCard({ platform }: { platform: Platform }) {
  const { label, Icon } = PLATFORM_META[platform];
  const connectable = isConfigured(platform);

  return (
    <Link
      href="/platforms"
      className="group flex flex-col rounded-xl border border-dashed border-border p-5 transition-colors hover:border-muted-foreground/40 hover:bg-card/40"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-[18px]" />
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-auto pt-8 text-xs text-muted-foreground">
        {connectable ? (
          <span className="inline-flex items-center gap-1 group-hover:text-foreground">
            <Plus className="size-3.5" />
            Connect
          </span>
        ) : (
          "Coming soon"
        )}
      </div>
    </Link>
  );
}

function NoConnections({ range }: { range: ReturnType<typeof parseRange> }) {
  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Overview of your video performance across all platforms"
        range={range}
        lastSyncedAt={null}
      />
      <div className="grid place-items-center rounded-xl border border-dashed border-border py-24">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h2 className="text-base font-medium">No channels connected</h2>
          <p className="text-sm text-muted-foreground">
            Connect YouTube to start collecting view counts. Nothing is shown
            here until there is real data to show.
          </p>
          <Button asChild className="mt-2">
            <Link href="/platforms">
              <Plus className="size-4" />
              Connect a platform
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
