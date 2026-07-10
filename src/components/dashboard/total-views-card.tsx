import { TrendingDown, TrendingUp } from "lucide-react";
import { formatFull, formatDelta } from "@/lib/format";
import { ViewsAreaChart } from "./views-area-chart";
import { EmptyChartState } from "./empty-chart-state";

type Point = { t: string; label: string; full: string; views: number };

export function TotalViewsCard({
  total,
  change,
  viewsToday,
  series,
  rangeLabel,
  hasHistory,
}: {
  total: number;
  change: { percent: number } | null;
  viewsToday: number | null;
  series: Point[];
  rangeLabel: string;
  hasHistory: boolean;
}) {
  const up = (change?.percent ?? 0) >= 0;
  const Trend = up ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">Total Views</h2>

      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
        {formatFull(total)}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {change ? (
          <span
            className={`flex items-center gap-1 font-medium ${
              up ? "text-emerald-400" : "text-red-400"
            }`}
          >
            <Trend className="size-3.5" />
            {Math.abs(change.percent).toFixed(1)}%
            <span className="font-normal text-muted-foreground">
              vs previous {rangeLabel.toLowerCase()}
            </span>
          </span>
        ) : (
          // No prior period to compare against. Say nothing rather than "0%".
          <span className="text-muted-foreground">
            No comparison yet
          </span>
        )}

        {viewsToday !== null ? (
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatDelta(viewsToday)}
            </span>{" "}
            today
          </span>
        ) : null}
      </div>

      <div className="mt-4 h-[180px]">
        {hasHistory ? (
          <ViewsAreaChart data={series} />
        ) : (
          <EmptyChartState className="h-full" />
        )}
      </div>
    </div>
  );
}
