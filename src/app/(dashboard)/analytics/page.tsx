import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/layout/topbar";
import { BiggestMovers } from "@/components/analytics/biggest-movers";
import { PlatformBreakdown } from "@/components/analytics/platform-breakdown";
import { PlatformAreaChart } from "@/components/analytics/platform-area-chart";
import { EmptyChartState } from "@/components/dashboard/empty-chart-state";
import { parseRange, resolveWindow, RANGE_LABELS } from "@/lib/ranges";
import type { Platform } from "@/lib/platforms";
import {
  getPlatformSummaries,
  getLastSyncedAt,
  getConnectionCount,
} from "@/server/queries/summary";
import {
  countBuckets,
  getViewsSeries,
  getBiggestMovers,
} from "@/server/queries/timeseries";

const MIN_BUCKETS = 2;

function labelsFor(series: { t: Date }[]): {
  short: (t: Date) => string;
  full: (t: Date) => string;
} {
  const withinTwoDays =
    series.length < 2 ||
    series[series.length - 1].t.getTime() - series[0].t.getTime() <=
      48 * 3600e3;
  return {
    short: withinTwoDays
      ? (t) => t.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
      : (t) => t.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    full: (t) =>
      t.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        hour12: true,
      }),
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const range = parseRange((await searchParams).range);
  const window = resolveWindow(range);

  const [connections, summaries, lastSyncedAt, buckets, movers] =
    await Promise.all([
      getConnectionCount(userId),
      getPlatformSummaries(userId),
      getLastSyncedAt(userId),
      countBuckets(userId, window),
      getBiggestMovers(userId, window, 8),
    ]);

  if (connections === 0) {
    return (
      <>
        <Topbar title="Analytics" range={range} lastSyncedAt={null} />
        <div className="grid place-items-center rounded-xl border border-dashed border-border py-24 text-sm text-muted-foreground">
          Connect a platform to see analytics.
        </div>
      </>
    );
  }

  const hasHistory = buckets >= MIN_BUCKETS;
  const platforms = summaries.map((s) => s.platform) as Platform[];

  // Merge each platform's series into one row per timestamp for the stacked
  // chart. Built only when there is history to draw.
  type ChartRow = { label: string; full: string } & Partial<Record<Platform, number>>;
  let chartData: ChartRow[] = [];
  if (hasHistory) {
    const perPlatform = await Promise.all(
      platforms.map(async (p) => ({
        platform: p,
        series: await getViewsSeries(userId, window, p),
      })),
    );
    const byTime = new Map<number, { t: Date } & Partial<Record<Platform, number>>>();
    for (const { platform, series } of perPlatform) {
      for (const point of series) {
        const key = point.t.getTime();
        const row = byTime.get(key) ?? { t: point.t };
        row[platform] = point.views;
        byTime.set(key, row);
      }
    }
    const rows = [...byTime.values()].sort(
      (a, b) => a.t.getTime() - b.t.getTime(),
    );
    const fmt = labelsFor(rows);
    chartData = rows.map((r) => {
      const out: ChartRow = { label: fmt.short(r.t), full: fmt.full(r.t) };
      for (const p of platforms) out[p] = r[p] ?? 0;
      return out;
    });
  }

  return (
    <>
      <Topbar
        title="Analytics"
        subtitle="Where your views come from, and what's moving"
        range={range}
        lastSyncedAt={lastSyncedAt}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-medium">Views over time by platform</h2>
            <div className="mt-4 h-[280px]">
              {hasHistory ? (
                <PlatformAreaChart data={chartData} platforms={platforms} />
              ) : (
                <EmptyChartState className="h-full" />
              )}
            </div>
          </section>

          <BiggestMovers
            movers={movers}
            hasHistory={hasHistory}
            rangeLabel={RANGE_LABELS[range]}
          />
        </div>

        <aside>
          <PlatformBreakdown summaries={summaries} />
        </aside>
      </div>
    </>
  );
}
