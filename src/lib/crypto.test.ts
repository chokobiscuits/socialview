import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptToken, decryptToken, isEncrypted, parseKey } from "./crypto";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

describe("token encryption", () => {
  test("round-trips a token", () => {
    const token = "ya29.a0AfB_byC-realistic-looking-google-access-token";
    assert.equal(decryptToken(encryptToken(token, KEY), KEY), token);
  });

  test("round-trips unicode and long values", () => {
    const token = "🔑".repeat(500);
    assert.equal(decryptToken(encryptToken(token, KEY), KEY), token);
  });

  test("ciphertext never contains the plaintext", () => {
    const token = "super-secret-refresh-token";
    assert.ok(!encryptToken(token, KEY).includes(token));
  });

  test("same plaintext encrypts differently each time (fresh IV)", () => {
    const a = encryptToken("same", KEY);
    const b = encryptToken("same", KEY);
    assert.notEqual(a, b, "IV reuse would leak that two tokens are identical");
    assert.equal(decryptToken(a, KEY), decryptToken(b, KEY));
  });

  test("emits the versioned wire format", () => {
    const enc = encryptToken("x", KEY);
    assert.equal(enc.split(":").length, 4);
    assert.equal(enc.split(":")[0], "v1");
    assert.ok(isEncrypted(enc));
    assert.ok(!isEncrypted("ya29.raw-plaintext-token"));
  });

  test("refuses to encrypt an empty token", () => {
    assert.throws(() => encryptToken("", KEY), /empty token/);
  });

  test("rejects a tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptToken("authentic", KEY).split(":");
    const buf = Buffer.from(ct, "base64");
    buf[0] ^= 0x01;
    assert.throws(() => decryptToken([v, iv, tag, buf.toString("base64")].join(":"), KEY));
  });

  test("rejects a tampered auth tag", () => {
    const [v, iv, tag, ct] = encryptToken("authentic", KEY).split(":");
    const buf = Buffer.from(tag, "base64");
    buf[0] ^= 0x01;
    assert.throws(() => decryptToken([v, iv, buf.toString("base64"), ct].join(":"), KEY));
  });

  test("rejects an unknown version prefix", () => {
    const parts = encryptToken("x", KEY).split(":");
    parts[0] = "v2";
    assert.throws(
      () => decryptToken(parts.join(":"), KEY),
      /Unsupported token encryption version/,
    );
  });

  test("rejects a malformed value", () => {
    assert.throws(() => decryptToken("not-encrypted", KEY), /Malformed/);
  });

  test("cannot decrypt with a different key", () => {
    const enc = encryptToken("secret", KEY);
    assert.throws(() => decryptToken(enc, OTHER_KEY));
  });
});

describe("key parsing", () => {
  test("accepts a 32-byte base64 key", () => {
    assert.equal(parseKey(KEY.toString("base64")).length, 32);
  });

  test("rejects a short key", () => {
    assert.throws(() => parseKey(randomBytes(16).toString("base64")), /32 bytes/);
  });

  test("rejects an empty key", () => {
    assert.throws(() => parseKey(""), /32 bytes/);
  });
});
