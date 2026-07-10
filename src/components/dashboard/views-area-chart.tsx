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
import { formatCompact, formatFull } from "@/lib/format";
import { TOTAL_VIEWS_COLOR } from "@/lib/platforms";

type Point = { t: string; label: string; full: string; views: number };

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="text-xs text-muted-foreground">{p.full}</div>
      <div className="text-sm font-medium tabular-nums">
        {formatFull(p.views)} views
      </div>
    </div>
  );
}

/**
 * A single series, so no legend: the card's heading names it. Axes and grid are
 * deliberately recessive; the data is the only thing with saturation.
 */
export function ViewsAreaChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="totalViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TOTAL_VIEWS_COLOR} stopOpacity={0.45} />
            <stop offset="100%" stopColor={TOTAL_VIEWS_COLOR} stopOpacity={0.02} />
          </linearGradient>
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
          content={<ChartTooltip />}
          cursor={{ stroke: TOTAL_VIEWS_COLOR, strokeWidth: 1, strokeOpacity: 0.5 }}
        />
        <Area
          type="monotone"
          dataKey="views"
          stroke={TOTAL_VIEWS_COLOR}
          strokeWidth={2}
          fill="url(#totalViews)"
          // ≥8px hover target, per the mark spec.
          activeDot={{ r: 4, strokeWidth: 2 }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
