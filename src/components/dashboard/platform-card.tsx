import { PLATFORM_META, itemNoun, type Platform } from "@/lib/platforms";
import { formatCompact } from "@/lib/format";
import { Sparkline } from "./sparkline";
import { EmptyChartState } from "./empty-chart-state";

export function PlatformCard({
  platform,
  views,
  videos,
  channels,
  series,
  hasHistory,
}: {
  platform: Platform;
  views: number;
  videos: number;
  channels: number;
  series: { t: string; views: number }[];
  hasHistory: boolean;
}) {
  const { label, Icon, color, chipClass } = PLATFORM_META[platform];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-8 place-items-center rounded-lg ${chipClass}`}>
          <Icon className="size-[18px]" />
        </span>
        <span className="text-sm font-medium">{label}</span>
        {channels > 1 ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {channels} channels
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">
          {formatCompact(views)}
        </span>
        <span className="text-sm text-muted-foreground">Views</span>
      </div>

      <div className="mt-1 flex items-end justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          {videos} {itemNoun(platform, videos)}
        </span>

        {hasHistory ? (
          <Sparkline data={series} color={color} className="h-10 w-28" />
        ) : (
          <EmptyChartState compact />
        )}
      </div>
    </div>
  );
}
