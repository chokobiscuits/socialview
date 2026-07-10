import type { PlatformConnection } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { adapterFor } from "../registry";
import { TokenRevokedError } from "../types";

/**
 * How close to expiry we refresh, per platform. The two shapes differ:
 *
 *  - YouTube and TikTok issue a short access token (1h / 24h) plus a long-lived
 *    refresh token. Refresh when the access token is nearly dead.
 *  - Instagram has no access/refresh pair: one long-lived token, valid 60 days,
 *    which you exchange for a new 60-day token before it lapses. Miss that
 *    window and the user must re-consent.
 */
const REFRESH_WINDOW_MS: Record<string, number> = {
  YOUTUBE: 5 * 60 * 1000, // 5 minutes
  TIKTOK: 5 * 60 * 1000,
  INSTAGRAM: 7 * 24 * 3600 * 1000, // 7 days before the 60-day token dies
};

function needsRefresh(connection: PlatformConnection, now: Date): boolean {
  const window = REFRESH_WINDOW_MS[connection.platform] ?? 5 * 60 * 1000;

  // Instagram: the *refresh* expiry is the one that matters.
  const deadline =
    connection.platform === "INSTAGRAM"
      ? connection.refreshExpiresAt
      : connection.accessExpiresAt;

  // No recorded expiry means we cannot prove the token is good; refresh to be safe.
  if (!deadline) return true;
  return deadline.getTime() - now.getTime() < window;
}

/**
 * Returns a usable access token for this connection, refreshing and persisting
 * a new one first if the current one is at or near expiry.
 *
 * Throws TokenRevokedError if the grant is gone. The caller is expected to mark
 * the connection NEEDS_REAUTH and move on to the next one.
 */
export async function getAccessToken(
  connection: PlatformConnection,
  now: Date = new Date(),
): Promise<string> {
  if (!needsRefresh(connection, now)) {
    return decryptToken(connection.accessTokenEnc);
  }

  if (!connection.refreshTokenEnc) {
    throw new TokenRevokedError(
      connection.platform,
      "Connection has no refresh token; the user must reconnect",
    );
  }

  const adapter = adapterFor(connection.platform);
  const tokens = await adapter.refresh(decryptToken(connection.refreshTokenEnc));

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptToken(tokens.accessToken),
      // Rotate the stored refresh token only when the platform issues a new one.
      ...(tokens.refreshToken
        ? { refreshTokenEnc: encryptToken(tokens.refreshToken) }
        : {}),
      accessExpiresAt: tokens.accessExpiresAt ?? null,
      ...(tokens.refreshExpiresAt
        ? { refreshExpiresAt: tokens.refreshExpiresAt }
        : {}),
    },
  });

  return tokens.accessToken;
}

/** Park a connection that can no longer sync without the user re-consenting. */
export async function markNeedsReauth(
  connectionId: string,
  reason: string,
): Promise<void> {
  await prisma.platformConnection.update({
    where: { id: connectionId },
    data: { status: "NEEDS_REAUTH", lastSyncError: reason },
  });
}
