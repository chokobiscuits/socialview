"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { formatCompact, formatFull } from "@/lib/format";

type Row = { label: string; full: string } & Partial<Record<Platform, number>>;

function ChartTooltip({
  active,
  payload,
  platforms,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  platforms: Platform[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const total = platforms.reduce((s, p) => s + (row[p] ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="text-xs text-muted-foreground">{row.full}</div>
      {platforms.map((p) => (
        <div key={p} className="mt-1 flex items-center gap-2 text-xs">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: PLATFORM_META[p].color }}
          />
          <span className="text-muted-foreground">{PLATFORM_META[p].label}</span>
          <span className="ml-auto font-medium tabular-nums">
            {formatFull(row[p] ?? 0)}
          </span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-border pt-1.5 text-xs">
        <span>Total</span>
        <span className="font-semibold tabular-nums">{formatFull(total)}</span>
      </div>
    </div>
  );
}

/**
 * Views over time, stacked by platform. Two or more series, so a legend is
 * always present (identity is never color-alone); each platform keeps its own
 * brand color across renders regardless of stacking order.
 */
export function PlatformAreaChart({
  data,
  platforms,
}: {
  data: Row[];
  platforms: Platform[];
}) {
  return (
    <div className="flex h-full flex-col">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {platforms.map((p) => (
              <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PLATFORM_META[p].color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={PLATFORM_META[p].color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="currentColor"
            className="text-border"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-muted-foreground"
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-muted-foreground"
            width={44}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip
            content={<ChartTooltip platforms={platforms} />}
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
          />
          {platforms.map((p) => (
            <Area
              key={p}
              type="monotone"
              dataKey={p}
              stackId="views"
              stroke={PLATFORM_META[p].color}
              strokeWidth={2}
              fill={`url(#grad-${p})`}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend: always present for 2+ series. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {platforms.map((p) => (
          <span key={p} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: PLATFORM_META[p].color }}
            />
            <span className="text-muted-foreground">{PLATFORM_META[p].label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
