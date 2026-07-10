/**
 * Every snapshot written by one sync run shares a single timestamp, floored to
 * the hour. That makes the time series a clean `GROUP BY capturedAt` instead of
 * a smear of per-video write times a few seconds apart.
 *
 * Kept free of database imports so it stays cheap to test and to reuse from the
 * read-side queries.
 */
export function bucketToHour(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d;
}
