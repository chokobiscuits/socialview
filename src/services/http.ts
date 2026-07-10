import type { Platform } from "@/generated/prisma/enums";
import { PlatformApiError } from "./types";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retryable: rate limits and transient server faults. Never 4xx auth errors. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * Exponential backoff with jitter. Honors Retry-After when the platform sends
 * one, since guessing shorter than instructed just earns another 429.
 */
function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  const exponential = BASE_DELAY_MS * 2 ** (attempt - 1);
  return exponential + Math.random() * 250;
}

/**
 * fetch() that retries transient failures and turns non-2xx into a typed error.
 * Returns the parsed JSON body.
 */
export async function fetchJson<T>(
  platform: Platform,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (cause) {
      // Network-level failure (DNS, socket). Retry.
      lastError = cause;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(backoffMs(attempt, null));
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const body = await res.text().catch(() => "");
    if (isRetryable(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt, res.headers.get("retry-after")));
      continue;
    }
    throw new PlatformApiError(
      platform,
      res.status,
      `${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
    );
  }

  throw new PlatformApiError(
    platform,
    0,
    `Network failure after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}
