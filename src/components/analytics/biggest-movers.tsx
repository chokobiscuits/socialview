import Link from "next/link";
import { TrendingUp, LineChart } from "lucide-react";
import { PLATFORM_META } from "@/lib/platforms";
import { formatCompact, formatDelta } from "@/lib/format";
import type { Mover } from "@/server/queries/timeseries";
import { Thumbnail } from "@/components/videos/thumbnail";
import { EmptyChartState } from "@/components/dashboard/empty-chart-state";

export function BiggestMovers({
  movers,
  hasHistory,
  rangeLabel,
}: {
  movers: Mover[];
  hasHistory: boolean;
  rangeLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-4 text-emerald-400" />
        <h2 className="text-sm font-medium">Biggest Movers</h2>
        <span className="text-xs text-muted-foreground">
          {rangeLabel.toLowerCase()}
        </span>
      </div>

      {!hasHistory ? (
        <EmptyChartState className="mt-4 h-40" />
      ) : movers.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No videos gained views in this window yet.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {movers.map((m, i) => {
            const { Icon, chipClass } = PLATFORM_META[m.platform];
            const row = (
              <>
                <span className="w-4 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <Thumbnail src={m.thumbnailUrl} alt="" className="h-9 w-16 shrink-0" />
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded ${chipClass}`}
                >
                  <Icon className="size-3" />
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug">
                  {m.title}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-emerald-400">
                    {formatDelta(m.delta)}
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {formatCompact(m.views)} total
                  </span>
                </span>
              </>
            );
            return (
              <li key={m.id} className="flex items-center gap-1">
                {m.permalink ? (
                  <a
                    href={m.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 -m-1.5 transition-colors hover:bg-accent"
                  >
                    {row}
                  </a>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3">{row}</div>
                )}
                <Link
                  href={`/videos/${m.id}`}
                  title="View analytics"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <LineChart className="size-4" />
                  <span className="sr-only">View analytics</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
