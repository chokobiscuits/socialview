"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

/**
 * A micro-chart: no axes, no grid, no tooltip. It carries a single message,
 * "the shape of recent growth", next to a number that carries the magnitude.
 * Identity comes from the card around it, not from the color.
 */
export function Sparkline({
  data,
  color,
  className,
}: {
  data: { t: string; views: number }[];
  color: string;
  className?: string;
}) {
  const id = `spark-${color.replace("#", "")}`;

  return (
    <div className={className} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Zoom to the data's own range: a sparkline shows shape, not scale. */}
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="views"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
