import { LineChart } from "lucide-react";

/**
 * Platform APIs report only a current view total, never a history. A chart
 * therefore needs at least two snapshots taken an hour apart before it can show
 * anything true. Until then we say so, rather than drawing a flat line at zero
 * or inventing a trend.
 */
export function EmptyChartState({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className={className}>
        <span className="text-xs text-muted-foreground">Collecting data</span>
      </div>
    );
  }
  return (
    <div
      className={`grid place-items-center rounded-lg border border-dashed border-border ${className ?? ""}`}
    >
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <LineChart className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">Collecting data</p>
        <p className="max-w-[34ch] text-xs text-muted-foreground">
          Platforms only report a current total, so history is built from hourly
          snapshots. This chart fills in over the next few hours.
        </p>
      </div>
    </div>
  );
}
