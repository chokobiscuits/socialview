import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

// env.ts reads process.env lazily through getters, so setting these before the
// adapter is *used* is enough; no dynamic import needed.
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

import { youtubeAdapter } from "./adapter";
import { TokenRevokedError, PlatformApiError } from "../types";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const realFetch = globalThis.fetch;
let calls: string[] = [];

function stubFetch(handler: Handler) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return handler(url, init);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const CHANNEL = {
  items: [
    {
      id: "UC_channel_abc",
      snippet: {
        title: "Choko",
        thumbnails: { default: { url: "https://yt/avatar.jpg" } },
      },
      contentDetails: { relatedPlaylists: { uploads: "UU_uploads_abc" } },
    },
  ],
};

const ctx = {
  connectionId: "c1",
  externalAccountId: "UC_channel_abc",
  accessToken: "at-123",
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("youtube adapter: authorizeUrl", () => {
  test("requests offline access and forces consent, or Google withholds the refresh token", () => {
    const u = new URL(youtubeAdapter.authorizeUrl("state123", "http://localhost:3000/cb"));
    assert.equal(u.searchParams.get("access_type"), "offline");
    assert.match(u.searchParams.get("prompt") ?? "", /consent/);
    assert.equal(u.searchParams.get("state"), "state123");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:3000/cb");
  });

  test("offers the account chooser, so a second channel can be connected", () => {
    const u = new URL(youtubeAdapter.authorizeUrl("s", "http://x/cb"));
    assert.match(u.searchParams.get("prompt") ?? "", /select_account/);
  });

  test("requests only the read-only scope", () => {
    const u = new URL(youtubeAdapter.authorizeUrl("s", "http://x/cb"));
    assert.equal(
      u.searchParams.get("scope"),
      "https://www.googleapis.com/auth/youtube.readonly",
    );
  });
});

describe("youtube adapter: exchangeCode", () => {
  test("returns tokens and the channel identity", async () => {
    stubFetch((url) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return json({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
      }
      return json(CHANNEL);
    });

    const { tokens, account } = await youtubeAdapter.exchangeCode("code", "http://x/cb");
    assert.equal(tokens.accessToken, "at");
    assert.equal(tokens.refreshToken, "rt");
    assert.ok(tokens.accessExpiresAt instanceof Date);
    assert.equal(account.externalAccountId, "UC_channel_abc");
    assert.equal(account.displayName, "Choko");
    assert.equal(account.avatarUrl, "https://yt/avatar.jpg");
  });

  test("fails clearly when the Google account has no channel", async () => {
    stubFetch((url) =>
      url.includes("/token")
        ? json({ access_token: "at", expires_in: 3600 })
        : json({ items: [] }),
    );
    await assert.rejects(
      () => youtubeAdapter.exchangeCode("code", "http://x/cb"),
      /no YouTube channel/,
    );
  });
});

describe("youtube adapter: refresh", () => {
  test("reuses the existing refresh token when Google does not rotate one", async () => {
    stubFetch(() => json({ access_token: "new-at", expires_in: 3600 }));
    const t = await youtubeAdapter.refresh("original-rt");
    assert.equal(t.accessToken, "new-at");
    assert.equal(t.refreshToken, "original-rt");
  });

  test("adopts a rotated refresh token", async () => {
    stubFetch(() => json({ access_token: "a", refresh_token: "rotated", expires_in: 3600 }));
    assert.equal((await youtubeAdapter.refresh("old")).refreshToken, "rotated");
  });

  test("maps invalid_grant to TokenRevokedError so sync flags NEEDS_REAUTH", async () => {
    stubFetch(() => new Response('{"error":"invalid_grant"}', { status: 400 }));
    await assert.rejects(() => youtubeAdapter.refresh("dead"), TokenRevokedError);
  });

  test("other token failures are not mistaken for revocation", async () => {
    stubFetch(() => new Response("boom", { status: 500 }));
    await assert.rejects(
      () => youtubeAdapter.refresh("rt"),
      (e: Error) => e.name !== "TokenRevokedError",
    );
  });
});

describe("youtube adapter: fetchVideoStats", () => {
  test("maps fields, prefers the largest thumbnail, builds the permalink", async () => {
    stubFetch((url) => {
      if (url.includes("/channels")) return json(CHANNEL);
      if (url.includes("/playlistItems"))
        return json({ items: [{ contentDetails: { videoId: "v1" } }] });
      return json({
        items: [
          {
            id: "v1",
            snippet: {
              title: "I Tried Living in -20°C",
              publishedAt: "2026-07-07T10:00:00Z",
              thumbnails: {
                default: { url: "d.jpg" },
                medium: { url: "m.jpg" },
                maxres: { url: "max.jpg" },
              },
            },
            statistics: { viewCount: "1240443", likeCount: "62100", commentCount: "2100" },
          },
        ],
      });
    });

    const out = [];
    for await (const v of youtubeAdapter.fetchVideoStats(ctx)) out.push(v);

    assert.equal(out.length, 1);
    assert.deepEqual(out[0], {
      externalId: "v1",
      title: "I Tried Living in -20°C",
      thumbnailUrl: "max.jpg",
      permalink: "https://www.youtube.com/watch?v=v1",
      publishedAt: new Date("2026-07-07T10:00:00Z"),
      views: 1240443,
      likes: 62100,
      comments: 2100,
    });
  });

  test("treats missing statistics as zero rather than NaN", async () => {
    stubFetch((url) => {
      if (url.includes("/channels")) return json(CHANNEL);
      if (url.includes("/playlistItems"))
        return json({ items: [{ contentDetails: { videoId: "v1" } }] });
      return json({
        items: [
          {
            id: "v1",
            snippet: { title: "Private", publishedAt: "2026-01-01T00:00:00Z" },
            statistics: {}, // hidden counts
          },
        ],
      });
    });
    const [v] = await Array.fromAsync(youtubeAdapter.fetchVideoStats(ctx));
    assert.equal(v.views, 0);
    assert.equal(v.likes, 0);
    assert.equal(v.thumbnailUrl, undefined);
  });

  test("follows pagination and batches 50 ids per videos.list call", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      contentDetails: { videoId: `v${i}` },
    }));
    const page2 = [{ contentDetails: { videoId: "v50" } }];

    stubFetch((url) => {
      if (url.includes("/channels")) return json(CHANNEL);
      if (url.includes("/playlistItems")) {
        const u = new URL(url);
        return u.searchParams.get("pageToken") === "PAGE2"
          ? json({ items: page2 })
          : json({ items: page1, nextPageToken: "PAGE2" });
      }
      const ids = new URL(url).searchParams.get("id")!.split(",");
      return json({
        items: ids.map((id) => ({
          id,
          snippet: { title: id, publishedAt: "2026-01-01T00:00:00Z" },
          statistics: { viewCount: "10" },
        })),
      });
    });

    const out = await Array.fromAsync(youtubeAdapter.fetchVideoStats(ctx));
    assert.equal(out.length, 51, "both pages yielded");

    const videoCalls = calls.filter((c) => c.includes("/videos?"));
    assert.equal(videoCalls.length, 2, "one videos.list per page, not per video");
    assert.equal(
      new URL(videoCalls[0]).searchParams.get("id")!.split(",").length,
      50,
      "first batch carries the full 50 ids",
    );

    // playlistItems must never request more than 50 at a time.
    for (const c of calls.filter((c) => c.includes("/playlistItems"))) {
      assert.equal(new URL(c).searchParams.get("maxResults"), "50");
    }
  });

  test("never calls the expensive search.list endpoint (100 quota units)", async () => {
    stubFetch((url) => {
      if (url.includes("/channels")) return json(CHANNEL);
      if (url.includes("/playlistItems")) return json({ items: [] });
      return json({ items: [] });
    });
    await Array.fromAsync(youtubeAdapter.fetchVideoStats(ctx));
    assert.ok(!calls.some((c) => c.includes("/search")));
  });

  test("skips the videos.list call entirely on an empty page", async () => {
    stubFetch((url) =>
      url.includes("/channels") ? json(CHANNEL) : json({ items: [] }),
    );
    const out = await Array.fromAsync(youtubeAdapter.fetchVideoStats(ctx));
    assert.equal(out.length, 0);
    assert.ok(!calls.some((c) => c.includes("/videos?")));
  });
});

describe("http retry", () => {
  test("retries a 429 then succeeds", async () => {
    let n = 0;
    stubFetch((url) => {
      if (url.includes("/channels")) {
        n++;
        if (n === 1) return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
        return json(CHANNEL);
      }
      return json({ items: [] });
    });
    await Array.fromAsync(youtubeAdapter.fetchVideoStats(ctx));
    assert.equal(n, 2, "retried once");
  });

  test("does not retry a 403 and surfaces PlatformApiError", async () => {
    let n = 0;
    stubFetch(() => {
      n++;
      return new Response("forbidden", { status: 403 });
    });
    await assert.rejects(
      () => Array.fromAsync(youtubeAdapter.fetchVideoStats(ctx)),
      PlatformApiError,
    );
    assert.equal(n, 1, "auth errors must not be retried");
  });
});
