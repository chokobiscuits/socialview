import type { Platform } from "@/generated/prisma/enums";
import type { PlatformAdapter } from "./types";
import { youtubeAdapter } from "./youtube/adapter";
import { tiktokAdapter } from "./tiktok/adapter";
import { instagramAdapter } from "./instagram/adapter";

export const ADAPTERS: Partial<Record<Platform, PlatformAdapter>> = {
  YOUTUBE: youtubeAdapter,
  TIKTOK: tiktokAdapter,
  INSTAGRAM: instagramAdapter,
};

export function adapterFor(platform: Platform): PlatformAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`No adapter registered for ${platform}`);
  return adapter;
}

/**
 * A platform is offerable only once its OAuth app credentials exist. Registering
 * the adapter is not enough: without credentials the connect flow would redirect
 * the user to a provider that rejects the request. Each of these needs a
 * developer app registered with the platform, and TikTok and Instagram both
 * gate real access behind an app review.
 */
const CREDENTIALS: Record<Platform, string[]> = {
  YOUTUBE: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  TIKTOK: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  INSTAGRAM: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
};

export function isConfigured(platform: Platform): boolean {
  return CREDENTIALS[platform].every((k) => Boolean(process.env[k]));
}

/** Platforms the user can connect right now, in display order. */
export function connectablePlatforms(): Platform[] {
  return (Object.keys(ADAPTERS) as Platform[]).filter(isConfigured);
}
