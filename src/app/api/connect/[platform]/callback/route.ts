import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { adapterFor, isConfigured } from "@/services/registry";
import { verifyState } from "@/services/oauth-state";
import {
  parsePlatformSlug,
  redirectUriFor,
  requiresRefreshToken,
  SCOPES,
} from "@/services/connect";
import type { Platform } from "@/generated/prisma/enums";

export const runtime = "nodejs";

function back(error?: string, platform?: Platform) {
  const url = new URL("/platforms", env.appUrl);
  if (error) url.searchParams.set("error", error);
  else if (platform) url.searchParams.set("connected", platform.toLowerCase());
  return NextResponse.redirect(url);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", env.appUrl));
  }

  const platform = parsePlatformSlug((await params).platform);
  if (!platform || !isConfigured(platform)) return back("unknown_platform");

  const search = request.nextUrl.searchParams;
  // The user pressed "Cancel" on the consent screen.
  if (search.get("error")) return back("denied");

  const code = search.get("code");
  const state = search.get("state");
  if (!code || !state) return back("missing_code");

  // Verify the state before spending the code: it proves this callback belongs
  // to a flow we started, for this user, on this platform.
  let payload;
  try {
    payload = verifyState(state, platform);
  } catch {
    return back("bad_state");
  }
  if (payload.userId !== session.user.id) return back("user_mismatch");

  let tokens, account;
  try {
    ({ tokens, account } = await adapterFor(platform).exchangeCode(
      code,
      redirectUriFor(platform),
    ));
  } catch (e) {
    if (e instanceof Error && /no YouTube channel/.test(e.message)) {
      return back("no_channel");
    }
    return back("exchange_failed");
  }

  // Without a refresh token we cannot sync past the access token's lifetime, so
  // refuse rather than storing a connection that dies within the hour.
  if (requiresRefreshToken(platform) && !tokens.refreshToken) {
    return back("no_refresh_token");
  }

  // A given real account belongs to exactly one SocialView user. Surface the
  // collision as a message rather than letting the unique constraint 500.
  const claimed = await prisma.platformConnection.findUnique({
    where: {
      platform_externalAccountId: {
        platform,
        externalAccountId: account.externalAccountId,
      },
    },
    select: { userId: true },
  });
  if (claimed && claimed.userId !== session.user.id) {
    return back("already_claimed");
  }

  const encrypted = {
    accessTokenEnc: encryptToken(tokens.accessToken),
    ...(tokens.refreshToken
      ? { refreshTokenEnc: encryptToken(tokens.refreshToken) }
      : {}),
    accessExpiresAt: tokens.accessExpiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
  };

  // Keyed on the account, so connecting a *second* channel adds a row rather
  // than overwriting the first.
  await prisma.platformConnection.upsert({
    where: {
      platform_externalAccountId: {
        platform,
        externalAccountId: account.externalAccountId,
      },
    },
    create: {
      userId: session.user.id,
      platform,
      externalAccountId: account.externalAccountId,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      scopes: SCOPES[platform],
      status: "ACTIVE",
      ...encrypted,
    },
    update: {
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      // Reconnecting clears a previous failure.
      status: "ACTIVE",
      lastSyncError: null,
      ...encrypted,
    },
  });

  return back(undefined, platform);
}
