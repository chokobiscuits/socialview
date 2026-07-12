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
import { formatCompact, formatFull } from "@/lib/format";

type Row = { t: number; label: string; full: string; views: number };

type Mode = "total" | "gained";

const LINE = "#22d3ee"; // cyan, matching the analytics "Total" line weight

function ChartTooltip({
  active,
  payload,
  gained,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  gained: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="text-xs text-muted-foreground">{row.full}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: LINE }}
        />
        <span className="text-muted-foreground">
          {gained ? "Gained" : "Views"}
        </span>
        <span className="ml-auto font-medium tabular-nums">
          {formatFull(row.views)}
        </span>
      </div>
    </div>
  );
}

/**
 * View history for a single video. Same time-keyed x-axis as the account-wide
 * chart: the axis is keyed on the unique bucket timestamp, not the date string,
 * so hourly points on one day stay distinct and the tooltip resolves to the
 * hovered bucket.
 */
export function VideoAreaChart({ data }: { data: Row[] }) {
  const [mode, setMode] = useState<Mode>("total");

  const chartData = useMemo(() => {
    if (mode === "total") return data;
    // "Gained" = views added since the previous bucket. First bucket dropped.
    return data.slice(1).map((row, i) => ({
      ...row,
      views: Math.max(0, row.views - data[i].views),
    }));
  }, [data, mode]);

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
            <linearGradient id="grad-video-views" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.5} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0.05} />
            </linearGradient>
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
            content={<ChartTooltip gained={mode === "gained"} />}
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke={LINE}
            strokeWidth={2}
            fill="url(#grad-video-views)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
