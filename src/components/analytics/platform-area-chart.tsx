"use client";

import { useMemo, useState } from "react";
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

type Row = { t: number; label: string; full: string } & Partial<Record<Platform, number>>;

type Mode = "total" | "gained";

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
  const [mode, setMode] = useState<Mode>("total");

  // "Gained" = the difference from the previous bucket, per platform. A
  // cumulative total only ever climbs; the delta shows where views are actually
  // being added. The first bucket has no predecessor, so it is dropped.
  const chartData = useMemo(() => {
    if (mode === "total") return data;
    return data.slice(1).map((row, i) => {
      const prev = data[i]; // data[i] is the row before data[i+1]
      const out: Row = { t: row.t, label: row.label, full: row.full };
      for (const p of platforms) {
        out[p] = Math.max(0, (row[p] ?? 0) - (prev[p] ?? 0));
      }
      return out;
    });
  }, [data, platforms, mode]);

  // Tick labels are looked up by timestamp: the XAxis is keyed on the unique
  // bucket time `t`, not on the (non-unique) date string, so hourly points on
  // the same day stay distinct and the tooltip resolves to the hovered bucket.
  const labelByT = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of chartData) m.set(row.t, row.label);
    return m;
  }, [chartData]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex justify-end">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          <button
            onClick={() => setMode("total")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              mode === "total"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Total
          </button>
          <button
            onClick={() => setMode("gained")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              mode === "gained"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Gained
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => labelByT.get(t) ?? ""}
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
