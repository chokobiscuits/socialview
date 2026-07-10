import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createState, verifyState } from "./oauth-state";

const SECRET = "test-auth-secret";
const OTHER = "attacker-secret";

describe("oauth state", () => {
  test("round-trips the userId and platform", () => {
    const s = createState("user_1", "YOUTUBE", SECRET);
    const p = verifyState(s, "YOUTUBE", SECRET);
    assert.equal(p.userId, "user_1");
    assert.equal(p.platform, "YOUTUBE");
  });

  test("two states for the same user differ (fresh nonce)", () => {
    assert.notEqual(
      createState("u", "YOUTUBE", SECRET),
      createState("u", "YOUTUBE", SECRET),
    );
  });

  test("rejects a state signed with a different secret", () => {
    const forged = createState("attacker", "YOUTUBE", OTHER);
    assert.throws(() => verifyState(forged, "YOUTUBE", SECRET), /signature mismatch/);
  });

  test("rejects a tampered userId, the account-binding attack", () => {
    const s = createState("victim", "YOUTUBE", SECRET);
    const [encoded, mac] = s.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    payload.userId = "attacker";
    const swapped = Buffer.from(JSON.stringify(payload)).toString("base64url");
    assert.throws(() => verifyState(`${swapped}.${mac}`, "YOUTUBE", SECRET), /signature mismatch/);
  });

  test("rejects a state minted for another platform", () => {
    const s = createState("u", "TIKTOK", SECRET);
    assert.throws(() => verifyState(s, "YOUTUBE", SECRET), /platform mismatch/);
  });

  test("rejects an expired state", () => {
    const [encoded] = createState("u", "YOUTUBE", SECRET).split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    payload.issuedAt = Date.now() - 11 * 60 * 1000;
    // Re-sign it properly, so we are testing expiry and not the signature.
    const re = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const mac = createHmac("sha256", SECRET).update(re).digest("base64url");
    assert.throws(() => verifyState(`${re}.${mac}`, "YOUTUBE", SECRET), /expired/);
  });

  test("rejects malformed input", () => {
    assert.throws(() => verifyState("garbage", "YOUTUBE", SECRET), /Malformed/);
    assert.throws(() => verifyState("a.b.c", "YOUTUBE", SECRET), /Malformed/);
  });

  test("rejects a truncated signature without throwing on length", () => {
    const s = createState("u", "YOUTUBE", SECRET);
    const [encoded] = s.split(".");
    assert.throws(() => verifyState(`${encoded}.AAAA`, "YOUTUBE", SECRET), /signature mismatch/);
  });
});
