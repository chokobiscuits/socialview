import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "./env";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("env.appUrl", () => {
  test("prefers an explicit NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://socialview.app";
    assert.equal(env.appUrl, "https://socialview.app");
  });

  test("strips a trailing slash, which would break byte-exact redirect matching", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://socialview.app/";
    assert.equal(env.appUrl, "https://socialview.app");
  });

  test("falls back to Vercel's injected production URL", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "socialview.vercel.app";
    assert.equal(env.appUrl, "https://socialview.vercel.app");
  });

  test("in development, localhost is fine", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.NODE_ENV = "development";
    assert.equal(env.appUrl, "http://localhost:3000");
  });

  test("in production, refuses to silently build redirect URIs against localhost", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.NODE_ENV = "production";
    assert.throws(() => env.appUrl, /NEXT_PUBLIC_APP_URL is not set/);
  });
});

describe("env required values", () => {
  test("a missing secret fails loudly rather than encrypting with undefined", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    assert.throws(() => env.tokenEncryptionKey, /TOKEN_ENCRYPTION_KEY/);
  });

  test("a malformed encryption key is rejected before it can be used", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    assert.throws(() => env.tokenEncryptionKey, /32 bytes/);
  });
});
