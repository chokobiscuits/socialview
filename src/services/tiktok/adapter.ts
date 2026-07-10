import type {
  ConnectionContext,
  PlatformAdapter,
  TokenSet,
  VideoStatDTO,
} from "../types";
import { TokenRevokedError, PlatformApiError } from "../types";
import { env } from "@/lib/env";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API = "https://open.tiktokapis.com/v2";

/** Comma separated, per TikTok's spec (not space, as OAuth2 usually is). */
const SCOPE = "user.info.basic,video.list";

/** video.list caps at 20 per page. */
const PAGE_SIZE = 20;

const VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "cover_image_url",
  "share_url",
  "create_time",
  "view_count",
  "like_count",
  "comment_count",
].join(",");

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  // Present only on failure; the OAuth endpoint uses a flat error shape,
  // unlike the data endpoints' {data, error} envelope.
  error?: string;
  error_description?: string;
};

/** Data endpoints wrap everything, and report success as error.code === "ok". */
type Envelope<T> = {
  data: T;
  error: { code: string; message: string; log_id: string };
};

type UserInfo = {
  user: { open_id: string; display_name?: string; avatar_url?: string };
};

type VideoList = {
  videos: {
    id: string;
    title?: string;
    video_description?: string;
    cover_image_url?: string;
    share_url?: string;
    create_time: number;
    view_count?: number;
    like_count?: number;
    comment_count?: number;
  }[];
  cursor: number;
  has_more: boolean;
};

async function tokenRequest(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || json.error) {
    const message = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    // TikTok does not document a distinct code for a dead refresh token, so
    // any failure of a *refresh* is treated as needing re-consent.
    if (body.grant_type === "refresh_token") {
      throw new TokenRevokedError("TIKTOK", `TikTok refresh failed: ${message}`);
    }
    throw new PlatformApiError("TIKTOK", res.status, message);
  }
  return json;
}

/**
 * Unwrap the {data, error} envelope. TikTok returns HTTP 200 with an error code
 * inside the body, so checking res.ok alone would silently accept failures.
 */
async function callApi<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as Envelope<T>;

  const code = json.error?.code;
  if (code && code !== "ok") {
    // Access token rejected: the caller should refresh and retry, and the token
    // manager handles that by refreshing before every sync.
    if (/access_token_invalid|scope_not_authorized/i.test(code)) {
      throw new TokenRevokedError("TIKTOK", json.error.message || code);
    }
    throw new PlatformApiError("TIKTOK", res.status, `${code}: ${json.error.message}`);
  }
  if (!res.ok) {
    throw new PlatformApiError("TIKTOK", res.status, res.statusText);
  }
  return json.data;
}

export const tiktokAdapter: PlatformAdapter = {
  platform: "TIKTOK",

  authorizeUrl(state, redirectUri) {
    const url = new URL(AUTH_URL);
    // TikTok calls it client_key, not the OAuth-conventional client_id.
    url.searchParams.set("client_key", env.tiktokClientKey);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    const t = await tokenRequest({
      client_key: env.tiktokClientKey,
      client_secret: env.tiktokClientSecret,
      // TikTok delivers the code URL-encoded; decode before exchanging.
      code: decodeURIComponent(code),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const info = await callApi<UserInfo>(
      `${API}/user/info/?fields=open_id,display_name,avatar_url`,
      { headers: { Authorization: `Bearer ${t.access_token}` } },
    );

    return {
      tokens: {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        accessExpiresAt: new Date(Date.now() + t.expires_in * 1000),
        refreshExpiresAt: new Date(Date.now() + t.refresh_expires_in * 1000),
      },
      account: {
        externalAccountId: t.open_id,
        displayName: info.user.display_name,
        avatarUrl: info.user.avatar_url,
      },
    };
  },

  async refresh(refreshToken): Promise<TokenSet> {
    const t = await tokenRequest({
      client_key: env.tiktokClientKey,
      client_secret: env.tiktokClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return {
      accessToken: t.access_token,
      // TikTok may rotate the refresh token; always persist what it returns.
      refreshToken: t.refresh_token ?? refreshToken,
      accessExpiresAt: new Date(Date.now() + t.expires_in * 1000),
      refreshExpiresAt: t.refresh_expires_in
        ? new Date(Date.now() + t.refresh_expires_in * 1000)
        : undefined,
    };
  },

  async *fetchVideoStats(ctx: ConnectionContext): AsyncIterable<VideoStatDTO> {
    let cursor: number | undefined;

    do {
      // `fields` goes in the query string; paging goes in the JSON body.
      const page = await callApi<VideoList>(
        `${API}/video/list/?fields=${VIDEO_FIELDS}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ctx.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            max_count: PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          }),
        },
      );

      for (const v of page.videos ?? []) {
        yield {
          externalId: v.id,
          // TikTok posts often have no title, only a description.
          title: v.title || v.video_description || "Untitled",
          thumbnailUrl: v.cover_image_url,
          permalink: v.share_url,
          // create_time is Unix seconds; the cursor is milliseconds.
          publishedAt: new Date(v.create_time * 1000),
          views: v.view_count ?? 0,
          likes: v.like_count ?? 0,
          comments: v.comment_count ?? 0,
        };
      }

      cursor = page.has_more ? page.cursor : undefined;
    } while (cursor);
  },
};
