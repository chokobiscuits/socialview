import type {
  ConnectionContext,
  ConnectedAccount,
  PlatformAdapter,
  TokenSet,
  VideoStatDTO,
} from "../types";
import { TokenRevokedError } from "../types";
import { fetchJson } from "../http";
import { env } from "@/lib/env";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";

/** Read-only access to the authenticated user's channel and video statistics. */
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

/** videos.list accepts up to 50 ids per call, and costs 1 quota unit either way. */
const BATCH = 50;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type ChannelsResponse = {
  items?: {
    id: string;
    snippet: { title: string; thumbnails?: { default?: { url: string } } };
    contentDetails: { relatedPlaylists: { uploads: string } };
  }[];
};

type PlaylistItemsResponse = {
  items: { contentDetails: { videoId: string } }[];
  nextPageToken?: string;
};

type VideosResponse = {
  items: {
    id: string;
    snippet: {
      title: string;
      publishedAt: string;
      thumbnails?: Record<string, { url: string }>;
    };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  }[];
};

function api(path: string, params: Record<string, string | undefined>): string {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

const authed = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // These are all unrecoverable without the user consenting again, so the
    // sync job must park the connection rather than retry it every hour:
    //
    //   invalid_grant      the refresh token was revoked or expired
    //   deleted_client     the OAuth client itself was deleted
    //   invalid_client     wrong client id/secret for this grant
    //   unauthorized_client the client may no longer use this grant type
    const fatal = /invalid_grant|deleted_client|invalid_client|unauthorized_client/;
    if (fatal.test(text)) {
      throw new TokenRevokedError(
        "YOUTUBE",
        `Google rejected the grant (${res.status}): ${text.slice(0, 120).replace(/\s+/g, " ")}`,
      );
    }
    throw new Error(`Google token endpoint ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Prefer the largest thumbnail Google offers, falling back down the ladder. */
function bestThumbnail(
  thumbs: Record<string, { url: string }> | undefined,
): string | undefined {
  if (!thumbs) return undefined;
  for (const size of ["maxres", "standard", "high", "medium", "default"]) {
    if (thumbs[size]) return thumbs[size].url;
  }
  return undefined;
}

async function fetchChannel(accessToken: string) {
  const data = await fetchJson<ChannelsResponse>(
    "YOUTUBE",
    api("channels", { part: "contentDetails,snippet", mine: "true" }),
    authed(accessToken),
  );
  const channel = data.items?.[0];
  if (!channel) {
    throw new Error("Google account has no YouTube channel");
  }
  return channel;
}

export const youtubeAdapter: PlatformAdapter = {
  platform: "YOUTUBE",

  authorizeUrl(state, redirectUri) {
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", env.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    // `access_type=offline` plus a consent prompt are both required before
    // Google will hand over a refresh token at all.
    url.searchParams.set("access_type", "offline");
    // `select_account` additionally lets the user pick a *different* channel,
    // which is what makes connecting a second channel possible; without it
    // Google silently reuses the currently signed-in account.
    url.searchParams.set("prompt", "select_account consent");
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    const t = await tokenRequest({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const channel = await fetchChannel(t.access_token);
    const account: ConnectedAccount = {
      externalAccountId: channel.id,
      displayName: channel.snippet.title,
      avatarUrl: channel.snippet.thumbnails?.default?.url,
    };

    return {
      tokens: {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        accessExpiresAt: new Date(Date.now() + t.expires_in * 1000),
      },
      account,
    };
  },

  async refresh(refreshToken): Promise<TokenSet> {
    const t = await tokenRequest({
      refresh_token: refreshToken,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      grant_type: "refresh_token",
    });
    return {
      accessToken: t.access_token,
      // Google reuses the existing refresh token unless it rotates one in.
      refreshToken: t.refresh_token ?? refreshToken,
      accessExpiresAt: new Date(Date.now() + t.expires_in * 1000),
    };
  },

  async *fetchVideoStats(ctx: ConnectionContext): AsyncIterable<VideoStatDTO> {
    const channel = await fetchChannel(ctx.accessToken);
    const uploads = channel.contentDetails.relatedPlaylists.uploads;

    let pageToken: string | undefined;
    do {
      const page = await fetchJson<PlaylistItemsResponse>(
        "YOUTUBE",
        api("playlistItems", {
          part: "contentDetails",
          playlistId: uploads,
          maxResults: String(BATCH),
          pageToken,
        }),
        authed(ctx.accessToken),
      );

      const ids = page.items.map((i) => i.contentDetails.videoId);
      if (ids.length > 0) {
        // One call for up to 50 videos: statistics arrive with the snippet, so
        // there is no separate insights request.
        const videos = await fetchJson<VideosResponse>(
          "YOUTUBE",
          api("videos", { part: "statistics,snippet", id: ids.join(",") }),
          authed(ctx.accessToken),
        );

        for (const v of videos.items) {
          yield {
            externalId: v.id,
            title: v.snippet.title,
            thumbnailUrl: bestThumbnail(v.snippet.thumbnails),
            permalink: `https://www.youtube.com/watch?v=${v.id}`,
            publishedAt: new Date(v.snippet.publishedAt),
            views: Number(v.statistics.viewCount ?? 0),
            likes: Number(v.statistics.likeCount ?? 0),
            comments: Number(v.statistics.commentCount ?? 0),
          };
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  },
};
