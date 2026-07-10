export const RANGE_KEYS = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export const DEFAULT_RANGE: RangeKey = "30d";

const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Narrow an untrusted ?range= value to a known key. */
export function parseRange(raw: string | string[] | undefined): RangeKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return RANGE_KEYS.includes(v as RangeKey) ? (v as RangeKey) : DEFAULT_RANGE;
}

export type Window = {
  /** Inclusive start of the current period; null means "all time". */
  start: Date | null;
  end: Date;
  /**
   * Start of the immediately preceding period of equal length, used for the
   * "vs previous period" comparison. Null when the range is "all".
   */
  previousStart: Date | null;
};

export function resolveWindow(range: RangeKey, now: Date = new Date()): Window {
  if (range === "all") return { start: null, end: now, previousStart: null };
  const days = RANGE_DAYS[range];
  const ms = days * 24 * 3600e3;
  return {
    start: new Date(now.getTime() - ms),
    end: now,
    previousStart: new Date(now.getTime() - 2 * ms),
  };
}
