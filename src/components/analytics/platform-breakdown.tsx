import { PLATFORM_META } from "@/lib/platforms";
import { formatCompact, formatFull } from "@/lib/format";
import type { PlatformSummary } from "@/server/queries/summary";

/**
 * Each platform's share of total views. A single stacked bar plus a labelled
 * list, so the split reads at a glance and the exact numbers are still there.
 * Brand colors are the platforms' own identities, not an arbitrary ramp.
 */
export function PlatformBreakdown({
  summaries,
}: {
  summaries: PlatformSummary[];
}) {
  const total = summaries.reduce((s, p) => s + p.views, 0);
  const ranked = [...summaries].sort((a, b) => b.views - a.views);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">Views by platform</h2>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {formatFull(total)}
      </div>

      {total > 0 ? (
        <>
          {/* The proportional bar. A 2px surface gap separates segments. */}
          <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {ranked
              .filter((p) => p.views > 0)
              .map((p) => (
                <div
                  key={p.platform}
                  style={{
                    width: `${(p.views / total) * 100}%`,
                    backgroundColor: PLATFORM_META[p.platform].color,
                  }}
                  title={`${PLATFORM_META[p.platform].label}: ${formatFull(p.views)}`}
                />
              ))}
          </div>

          <ul className="mt-5 flex flex-col gap-3">
            {ranked.map((p) => {
              const { label, Icon, chipClass, color } = PLATFORM_META[p.platform];
              const pct = total > 0 ? (p.views / total) * 100 : 0;
              return (
                <li key={p.platform} className="flex items-center gap-3">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg ${chipClass}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm">{label}</span>
                      <span className="text-sm font-medium tabular-nums">
                        {formatCompact(p.views)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {p.videos} {p.videos === 1 ? "video" : "videos"}
                        {p.channels > 1 ? ` · ${p.channels} channels` : ""}
                      </span>
                      <span
                        className="tabular-nums"
                        style={{ color }}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No views yet. Connect a platform and run a sync.
        </p>
      )}
    </div>
  );
}
