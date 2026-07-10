import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.INSTAGRAM_APP_ID = "test-app-id";
process.env.INSTAGRAM_APP_SECRET = "test-app-secret";

import { instagramAdapter } from "./adapter";
import { TokenRevokedError, PlatformApiError } from "../types";

const realFetch = globalThis.fetch;
let calls: string[] = [];

function stub(handler: (url: string, init?: RequestInit) => Response) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return handler(url, init);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Meta's error envelope. code 190 means the token is dead. */
const graphError = (code: number, message = "boom", status = 400) =>
  json({ error: { message, type: "OAuthException", code } }, status);

const ctx = { connectionId: "c1", externalAccountId: "ig1", accessToken: "long-token" };

const REEL = {
  id: "m1",
  caption: "Push Day = Best Day\n#GymMotivation",
  media_type: "VIDEO",
  media_product_type: "REELS",
  thumbnail_url: "thumb.jpg",
  permalink: "https://instagram.com/reel/m1",
  timestamp: "2026-07-04T10:00:00+0000",
  like_count: 32_700,
  comments_count: 512,
};

const PHOTO = {
  id: "m2",
  media_type: "IMAGE",
  media_product_type: "FEED",
  timestamp: "2026-07-01T10:00:00+0000",
};

const insights = (value: number) => json({ data: [{ name: "views", values: [{ value }] }] });

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("instagram: authorizeUrl", () => {
  test("uses the Instagram Login host, not the Facebook one", () => {
    const u = new URL(instagramAdapter.authorizeUrl("s", "http://x/cb"));
    assert.equal(u.hostname, "www.instagram.com");
    assert.equal(u.pathname, "/oauth/authorize");
  });

  test("requests the business_basic and manage_insights scopes, comma separated", () => {
    const u = new URL(instagramAdapter.authorizeUrl("s", "http://x/cb"));
    assert.equal(
      u.searchParams.get("scope"),
      "instagram_business_basic,instagram_business_manage_insights",
    );
  });
});

describe("instagram: exchangeCode", () => {
  test("trades the 1-hour token for a 60-day one before storing anything", async () => {
    stub((url) => {
      if (url.includes("api.instagram.com/oauth/access_token"))
        return json({ access_token: "short", user_id: 1784 });
      if (url.includes("ig_exchange_token"))
        return json({ access_token: "long", token_type: "bearer", expires_in: 5_183_944 });
      return json({ user_id: "ig-1", username: "choko", profile_picture_url: "a.jpg" });
    });

    const { tokens, account } = await instagramAdapter.exchangeCode("code", "http://x/cb");

    assert.equal(tokens.accessToken, "long", "the short-lived token is never stored");
    assert.equal(account.externalAccountId, "ig-1");
    assert.equal(account.displayName, "choko");
    assert.ok(calls.some((c) => c.includes("ig_exchange_token")));

    // ~60 days out.
    const days = (tokens.accessExpiresAt!.getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 55 && days < 62, `expected ~60 days, got ${days}`);
  });

  test("stores the long-lived token in both slots, since there is no refresh grant", async () => {
    stub((url) => {
      if (url.includes("api.instagram.com")) return json({ access_token: "short", user_id: 1 });
      if (url.includes("ig_exchange_token")) return json({ access_token: "long", expires_in: 5_183_944 });
      return json({ user_id: "ig-1" });
    });
    const { tokens } = await instagramAdapter.exchangeCode("c", "http://x/cb");
    assert.equal(tokens.refreshToken, tokens.accessToken);
  });

  test("surfaces a failed short-token exchange", async () => {
    stub(() => json({ error: { message: "bad code", type: "OAuthException", code: 100 } }, 400));
    await assert.rejects(
      () => instagramAdapter.exchangeCode("bad", "http://x/cb"),
      PlatformApiError,
    );
  });
});

describe("instagram: refresh", () => {
  test("exchanges a still-valid long-lived token for a fresh 60 days", async () => {
    stub(() => json({ access_token: "renewed", expires_in: 5_183_944 }));
    const t = await instagramAdapter.refresh("current");
    assert.equal(t.accessToken, "renewed");
    assert.equal(t.refreshToken, "renewed");
    assert.ok(calls[0].includes("ig_refresh_token"));
  });

  test("a lapsed token (code 190) means the user must re-consent", async () => {
    stub(() => graphError(190, "Session has expired"));
    await assert.rejects(() => instagramAdapter.refresh("lapsed"), TokenRevokedError);
  });
});

describe("instagram: fetchVideoStats", () => {
  test("fetches views per media, because there is no batch insights endpoint", async () => {
    stub((url) => {
      if (url.includes("/me/media")) return json({ data: [REEL] });
      if (url.includes("/insights")) return insights(421_990);
      return json({});
    });

    const [v] = await Array.fromAsync(instagramAdapter.fetchVideoStats(ctx));
    assert.equal(v.views, 421_990);
    assert.equal(v.externalId, "m1");
    assert.equal(v.permalink, "https://instagram.com/reel/m1");
    assert.ok(calls.some((c) => c.includes("m1/insights?metric=views")));
  });

  test("takes likes and comments from the media object, not from insights", async () => {
    stub((url) =>
      url.includes("/me/media") ? json({ data: [REEL] }) : insights(1),
    );
    const [v] = await Array.fromAsync(instagramAdapter.fetchVideoStats(ctx));
    assert.equal(v.likes, 32_700);
    assert.equal(v.comments, 512);
  });

  test("skips photos, which have no view count worth tracking", async () => {
    stub((url) =>
      url.includes("/me/media") ? json({ data: [REEL, PHOTO] }) : insights(10),
    );
    const out = await Array.fromAsync(instagramAdapter.fetchVideoStats(ctx));
    assert.equal(out.length, 1);
    assert.equal(out[0].externalId, "m1");
    assert.ok(!calls.some((c) => c.includes("m2/insights")), "no insights call for the photo");
  });

  test("uses the caption's first line as the title", async () => {
    stub((url) => (url.includes("/me/media") ? json({ data: [REEL] }) : insights(1)));
    const [v] = await Array.fromAsync(instagramAdapter.fetchVideoStats(ctx));
    assert.equal(v.title, "Push Day = Best Day");
  });

  test("names an uncaptioned reel rather than yielding an empty title", async () => {
    stub((url) =>
      url.includes("/me/media") ? json({ data: [{ ...REEL, caption: undefined }] }) : insights(1),
    );
    const [v] = await Array.fromAsync(instagramAdapter.fetchVideoStats(ctx));
    assert.equal(v.title, "Reel");
  });

  test("one media's unsupported metric does not lose the other videos", async () => {
    stub((url) => {
      if (url.includes("/me/media"))
        return json({ data: [REEL, { ...REEL, id: "m3" }] });
      // m1's insights fail with code 100 (metric unsupported for this media).
      if (url.includes("m1/insights")) return graphError(100, "unsupported metric");
      return insights(999);
    });

    const out = await Array.fromAsync(instagramAdapter.fetchVideoStats(ctx));
    assert.equal(out.length, 2, "both videos still yielded");
    assert.equal(out[0].views, 0, "the failing one reports zero, not a crash");
    assert.equal(out[1].views, 999);
  });

  test("a revoked token during insights aborts the whole sync", async () => {
    stub((url) => {
      if (url.includes("/me/media")) return json({ data: [REEL] });
      return graphError(190, "revoked");
    });
    await assert.rejects(
      () => Array.fromAsync(instagramAdapter.fetchVideoStats(ctx)),
      TokenRevokedError,
    );
  });

  test("follows paging.next until exhausted", async () => {
    let page = 0;
    stub((url) => {
      if (url.includes("/insights")) return insights(5);
      page++;
      return page === 1
        ? json({
            data: [REEL],
            paging: { next: "https://graph.instagram.com/me/media?after=CURSOR" },
          })
        : json({ data: [{ ...REEL, id: "m9" }] });
    });

    const out = await Array.fromAsync(instagramAdapter.fetchVideoStats(ctx));
    assert.equal(out.length, 2);
    assert.ok(calls.some((c) => c.includes("after=CURSOR")));
  });
});
