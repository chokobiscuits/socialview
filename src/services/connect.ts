import "server-only";
import type { Platform } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { PLATFORMS } from "@/lib/platforms";

/**
 * The redirect URI must be byte-identical between the /authorize call and the
 * /token call, and must be pre-registered with the provider. Deriving it in one
 * place keeps those three copies honest.
 */
export function redirectUriFor(platform: Platform): string {
  return new URL(
    `/api/connect/${platform.toLowerCase()}/callback`,
    env.appUrl,
  ).toString();
}

/** Narrow an untrusted route segment to a real platform. */
export function parsePlatformSlug(slug: string): Platform | null {
  const upper = slug.toUpperCase();
  return PLATFORMS.includes(upper as Platform) ? (upper as Platform) : null;
}

/** Scopes recorded on the connection, for display and debugging. */
export const SCOPES: Record<Platform, string> = {
  YOUTUBE: "youtube.readonly",
  TIKTOK: "user.info.basic,video.list",
  INSTAGRAM: "instagram_business_basic,instagram_business_manage_insights",
};

/**
 * Whether a platform hands back a separate refresh token that we must have in
 * order to keep syncing unattended.
 *
 * Instagram is the exception: it has no refresh grant at all. Its single
 * long-lived token is exchanged for a fresh 60-day one before it lapses, so we
 * store that same token in both slots.
 */
export function requiresRefreshToken(platform: Platform): boolean {
  return platform !== "INSTAGRAM";
}
