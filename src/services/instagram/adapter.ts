import pLimit from "p-limit";
import type {
  ConnectionContext,
  PlatformAdapter,
  TokenSet,
  VideoStatDTO,
} from "../types";
import { TokenRevokedError, PlatformApiError } from "../types";
import { env } from "@/lib/env";

/**
 * "Instagram API with Instagram Login" -- NOT the legacy Facebook-Login variant,
 * which additionally requires the account be linked to a Facebook Page.
 */
const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

/** Comma separated, as Instagram specifies. */
const SCOPE = "instagram_business_basic,instagram_business_manage_insights";

const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "thumbnail_url",
  "media_url",
  "permalink",
  "timestamp",
  "like_count",
  "comments_count",
].join(",");

/**
 * Instagram gives no batch insights endpoint: views must be fetched one media
 * at a time. Cap the concurrency so a large library does not trip the rate
 * limiter, which is scaled to the account's impressions.
 */
const INSIGHTS_CONCURRENCY = 3;

type GraphError = {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
};

type MediaItem = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "AD" | "FEED" | "REELS" | "STORY";
  thumbnail_url?: string;
  media_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

type MediaPage = {
  data: MediaItem[];
  paging?: { cursors?: { after?: string }; next?: string };
};

type InsightsResponse = {
  data: { name: string; values: { value: number }[] }[];
};

/**
 * Meta answers an expired or revoked token with HTTP 400 and OAuthException
 * code 190. Anything else is a transient or programming fault.
 */
async function graph<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as T & GraphError;

  if (json.error) {
    const { code, message, error_subcode } = json.error;
    if (code === 190) {
      throw new TokenRevokedError(
        "INSTAGRAM",
        `Instagram token invalid (code 190${error_subcode ? `/${error_subcode}` : ""}): ${message}`,
      );
    }
    throw new PlatformApiError("INSTAGRAM", res.status, `${code}: ${message}`);
  }
  if (!res.ok) {
    throw new PlatformApiError("INSTAGRAM", res.status, res.statusText);
  }
  return json;
}

/** Only video posts and Reels have a meaningful view count. */
function isVideo(m: MediaItem): boolean {
  return m.media_type === "VIDEO" || m.media_product_type === "REELS";
}

function titleOf(m: MediaItem): string {
  const caption = m.caption?.trim();
  if (!caption) return m.media_product_type === "REELS" ? "Reel" : "Video";
  const firstLine = caption.split("\n")[0];
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

async function fetchViews(mediaId: string, token: string): Promise<number> {
  try {
    const res = await graph<InsightsResponse>(
      `${GRAPH}/${mediaId}/insights?metric=views&access_token=${token}`,
    );
    return res.data[0]?.values[0]?.value ?? 0;
  } catch (e) {
    // A revoked token must abort the whole sync, but a metric unsupported for
    // one particular media (Graph code 100) should not lose the other videos.
    if (e instanceof TokenRevokedError) throw e;
    return 0;
  }
}

export const instagramAdapter: PlatformAdapter = {
  platform: "INSTAGRAM",

  authorizeUrl(state, redirectUri) {
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", env.instagramAppId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    // This endpoint alone wants multipart/form-data, not urlencoded.
    const form = new FormData();
    form.set("client_id", env.instagramAppId);
    form.set("client_secret", env.instagramAppSecret);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", redirectUri);
    form.set("code", code);

    const res = await fetch(SHORT_TOKEN_URL, { method: "POST", body: form });
    const short = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      user_id?: number;
    } & GraphError;
    if (!res.ok || !short.access_token) {
      throw new PlatformApiError(
        "INSTAGRAM",
        res.status,
        short.error?.message ?? "Short-lived token exchange failed",
      );
    }

    // The short-lived token lasts an hour. Immediately trade it for the
    // 60-day one, which is the only thing worth storing.
    const long = await graph<{ access_token: string; expires_in: number }>(
      `${GRAPH}/access_token?grant_type=ig_exchange_token` +
        `&client_secret=${env.instagramAppSecret}` +
        `&access_token=${short.access_token}`,
    );

    const me = await graph<{
      user_id: string;
      username?: string;
      profile_picture_url?: string;
    }>(
      `${GRAPH}/me?fields=user_id,username,profile_picture_url&access_token=${long.access_token}`,
    );

    return {
      tokens: {
        accessToken: long.access_token,
        // There is no separate refresh token: the long-lived token refreshes
        // itself. Record it in both slots so the token manager can rotate it.
        refreshToken: long.access_token,
        accessExpiresAt: new Date(Date.now() + long.expires_in * 1000),
        refreshExpiresAt: new Date(Date.now() + long.expires_in * 1000),
      },
      account: {
        externalAccountId: me.user_id ?? String(short.user_id),
        displayName: me.username,
        avatarUrl: me.profile_picture_url,
      },
    };
  },

  /**
   * Instagram has no refresh-token grant. You exchange a still-valid long-lived
   * token for a fresh 60-day one, which is why the token manager refreshes
   * ~7 days before expiry rather than at expiry: once it lapses, the only cure
   * is the user re-consenting.
   */
  async refresh(currentToken): Promise<TokenSet> {
    const t = await graph<{ access_token: string; expires_in: number }>(
      `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`,
    );
    const expiresAt = new Date(Date.now() + t.expires_in * 1000);
    return {
      accessToken: t.access_token,
      refreshToken: t.access_token,
      accessExpiresAt: expiresAt,
      refreshExpiresAt: expiresAt,
    };
  },

  async *fetchVideoStats(ctx: ConnectionContext): AsyncIterable<VideoStatDTO> {
    const limit = pLimit(INSIGHTS_CONCURRENCY);
    let url =
      `${GRAPH}/me/media?fields=${MEDIA_FIELDS}&limit=50` +
      `&access_token=${ctx.accessToken}`;

    while (url) {
      const page = await graph<MediaPage>(url);
      const videos = (page.data ?? []).filter(isVideo);

      // Views require one insights call per media. Fetch a page's worth
      // concurrently, then yield, so memory stays bounded.
      const stats = await Promise.all(
        videos.map((m) =>
          limit(async () => ({
            media: m,
            views: await fetchViews(m.id, ctx.accessToken),
          })),
        ),
      );

      for (const { media, views } of stats) {
        yield {
          externalId: media.id,
          title: titleOf(media),
          // Videos expose a poster via thumbnail_url; media_url is the mp4.
          thumbnailUrl: media.thumbnail_url ?? media.media_url,
          permalink: media.permalink,
          publishedAt: new Date(media.timestamp),
          views,
          // Likes and comments live on the media object, not in insights.
          likes: media.like_count ?? 0,
          comments: media.comments_count ?? 0,
        };
      }

      url = page.paging?.next ?? "";
    }
  },
};
