/**
 * Compact view counts, matching the mockup: 8.42M, 493K, 1.24M, 842K.
 * Two significant decimals below 10M, none above, so cards stay narrow.
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1_000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1_000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}K`.replace(".0K", "K");
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(2) : m.toFixed(1)}M`;
}

/** Full precision with thousands separators, for table cells. */
export function formatFull(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Signed delta, e.g. "+12,441" or "-88". Used for movers and today's gain. */
export function formatDelta(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatFull(n)}`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600e3],
  ["month", 30 * 24 * 3600e3],
  ["week", 7 * 24 * 3600e3],
  ["day", 24 * 3600e3],
  ["hour", 3600e3],
  ["minute", 60e3],
];

const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/** "2 days ago", "1 week ago", "Today". */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60e3) return "Just now";
  if (abs < 24 * 3600e3 && date.getDate() === now.getDate()) return "Today";
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "Today";
}

/**
 * Percent change rendered as "12.4%". Returns null when there is no prior
 * value to compare against, so callers render a dash rather than a fake 0%.
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
