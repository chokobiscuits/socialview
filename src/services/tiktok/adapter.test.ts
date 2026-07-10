import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.TIKTOK_CLIENT_KEY = "test-client-key";
process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";

import { tiktokAdapter } from "./adapter";
import { TokenRevokedError, PlatformApiError } from "../types";

const realFetch = globalThis.fetch;
let calls: { url: string; init?: RequestInit }[] = [];

function stub(handler: (url: string, init?: RequestInit) => Response) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Success is signalled by error.code === "ok", not merely HTTP 200. */
const ok = <T,>(data: T) => json({ data, error: { code: "ok", message: "", log_id: "1" } });

const TOKENS = {
  access_token: "act.123",
  refresh_token: "rft.456",
  expires_in: 86400,
  refresh_expires_in: 31536000,
  open_id: "open-id-abc",
  scope: "user.info.basic,video.list",
};

const ctx = { connectionId: "c1", externalAccountId: "open-id-abc", accessToken: "at" };

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("tiktok: authorizeUrl", () => {
  test("uses client_key, not the OAuth-conventional client_id", () => {
    const u = new URL(tiktokAdapter.authorizeUrl("s", "http://x/cb"));
    assert.equal(u.searchParams.get("client_key"), "test-client-key");
    assert.equal(u.searchParams.get("client_id"), null);
  });

  test("separates scopes with commas, as TikTok requires", () => {
    const u = new URL(tiktokAdapter.authorizeUrl("s", "http://x/cb"));
    assert.equal(u.searchParams.get("scope"), "user.info.basic,video.list");
  });

  test("carries state and response_type", () => {
    const u = new URL(tiktokAdapter.authorizeUrl("st8", "http://x/cb"));
    assert.equal(u.searchParams.get("state"), "st8");
    assert.equal(u.searchParams.get("response_type"), "code");
  });
});

describe("tiktok: exchangeCode", () => {
  test("posts urlencoded client_key and returns identity", async () => {
    stub((url) =>
      url.includes("/oauth/token")
        ? json(TOKENS)
        : ok({ user: { open_id: "open-id-abc", display_name: "choko", avatar_url: "a.jpg" } }),
    );

    const { tokens, account } = await tiktokAdapter.exchangeCode("code", "http://x/cb");
    assert.equal(tokens.accessToken, "act.123");
    assert.equal(tokens.refreshToken, "rft.456");
    assert.equal(account.externalAccountId, "open-id-abc");
    assert.equal(account.displayName, "choko");

    const body = String(calls[0].init?.body);
    assert.match(body, /client_key=test-client-key/);
    assert.ok(!body.includes("client_id="));
    assert.equal(
      (calls[0].init?.headers as Record<string, string>)["Content-Type"],
      "application/x-www-form-urlencoded",
    );
  });

  test("records both access and refresh expiry", async () => {
    stub((url) => (url.includes("/oauth/token") ? json(TOKENS) : ok({ user: { open_id: "x" } })));
    const { tokens } = await tiktokAdapter.exchangeCode("c", "http://x/cb");
    assert.ok(tokens.accessExpiresAt instanceof Date);
    assert.ok(tokens.refreshExpiresAt instanceof Date);
    // Refresh token lives a year; access token a day.
    assert.ok(tokens.refreshExpiresAt! > tokens.accessExpiresAt!);
  });
});

describe("tiktok: refresh", () => {
  test("adopts a rotated refresh token", async () => {
    stub(() => json({ ...TOKENS, refresh_token: "rotated" }));
    assert.equal((await tiktokAdapter.refresh("old")).refreshToken, "rotated");
  });

  test("any refresh failure means re-consent, since TikTok documents no code", async () => {
    stub(() => json({ error: "invalid_grant", error_description: "dead" }, 400));
    await assert.rejects(() => tiktokAdapter.refresh("dead"), TokenRevokedError);
  });
});

describe("tiktok: fetchVideoStats", () => {
  const VIDEO = {
    id: "v1",
    title: "",
    video_description: "Funny clip",
    cover_image_url: "cover.jpg",
    share_url: "https://tiktok.com/@u/video/v1",
    create_time: 1_780_000_000,
    view_count: 842_112,
    like_count: 80_500,
    comment_count: 1_300,
  };

  test("passes fields in the query string and paging in the body", async () => {
    stub(() => ok({ videos: [VIDEO], cursor: 0, has_more: false }));
    await Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx));

    const call = calls[0];
    assert.match(call.url, /\/video\/list\/\?fields=/, "fields belong in the query");
    assert.equal(call.init?.method, "POST");
    const body = JSON.parse(String(call.init?.body));
    assert.equal(body.max_count, 20, "20 is TikTok's per-page maximum");
    assert.equal(body.cursor, undefined, "no cursor on the first page");
  });

  test("falls back to the description when a video has no title", async () => {
    stub(() => ok({ videos: [VIDEO], cursor: 0, has_more: false }));
    const [v] = await Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx));
    assert.equal(v.title, "Funny clip");
    assert.equal(v.views, 842_112);
    assert.equal(v.permalink, "https://tiktok.com/@u/video/v1");
  });

  test("reads create_time as seconds, not milliseconds", async () => {
    stub(() => ok({ videos: [VIDEO], cursor: 0, has_more: false }));
    const [v] = await Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx));
    assert.equal(v.publishedAt!.getTime(), 1_780_000_000 * 1000);
  });

  test("titles an untitled, undescribed video rather than yielding an empty string", async () => {
    stub(() => ok({ videos: [{ ...VIDEO, title: "", video_description: "" }], cursor: 0, has_more: false }));
    const [v] = await Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx));
    assert.equal(v.title, "Untitled");
  });

  test("follows the cursor while has_more", async () => {
    let page = 0;
    stub(() => {
      page++;
      return page === 1
        ? ok({ videos: [VIDEO], cursor: 1_643_332_803_000, has_more: true })
        : ok({ videos: [{ ...VIDEO, id: "v2" }], cursor: 0, has_more: false });
    });

    const out = await Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx));
    assert.equal(out.length, 2);
    assert.equal(JSON.parse(String(calls[1].init?.body)).cursor, 1_643_332_803_000);
  });

  test("an error inside a 200 response is not mistaken for success", async () => {
    // TikTok returns HTTP 200 with a failure code in the envelope.
    stub(() => json({ data: {}, error: { code: "invalid_params", message: "bad", log_id: "1" } }));
    await assert.rejects(
      () => Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx)),
      PlatformApiError,
    );
  });

  test("an invalidated access token surfaces as TokenRevokedError", async () => {
    stub(() => json({ data: {}, error: { code: "access_token_invalid", message: "x", log_id: "1" } }));
    await assert.rejects(
      () => Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx)),
      TokenRevokedError,
    );
  });

  test("handles a page with no videos", async () => {
    stub(() => ok({ videos: [], cursor: 0, has_more: false }));
    assert.deepEqual(await Array.fromAsync(tiktokAdapter.fetchVideoStats(ctx)), []);
  });
});
