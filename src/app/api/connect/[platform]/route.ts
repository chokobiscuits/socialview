import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { adapterFor, isConfigured } from "@/services/registry";
import { createState } from "@/services/oauth-state";
import { parsePlatformSlug, redirectUriFor } from "@/services/connect";

// node:crypto and Prisma need the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Starts a platform *data connection* flow. Deliberately separate from signing
 * in: logging in with Google never asks for access to your videos.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", env.appUrl));
  }

  const platform = parsePlatformSlug((await params).platform);
  if (!platform) {
    return NextResponse.redirect(new URL("/platforms?error=unknown_platform", env.appUrl));
  }
  if (!isConfigured(platform)) {
    return NextResponse.redirect(
      new URL("/platforms?error=not_configured", env.appUrl),
    );
  }

  const state = createState(session.user.id, platform);
  return NextResponse.redirect(
    adapterFor(platform).authorizeUrl(state, redirectUriFor(platform)),
  );
}
