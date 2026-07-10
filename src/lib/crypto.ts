import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * OAuth tokens are the crown jewels: whoever holds one can read the user's
 * video data until it is revoked. We treat the database as untrusted and store
 * only ciphertext.
 *
 * AES-256-GCM is authenticated encryption, so a tampered ciphertext fails to
 * decrypt rather than silently yielding garbage (which raw CBC would).
 *
 * Wire format: v1:<iv>:<authTag>:<ciphertext>, each part base64.
 * The version prefix lets us rotate the key or algorithm later without
 * guessing at how existing rows were written.
 *
 * This module holds no secrets of its own; the key is resolved lazily from the
 * environment (see ./env), or injected by tests.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
/** 96 bits is the GCM-recommended IV size. Fresh per encryption, never reused. */
const IV_BYTES = 12;
const KEY_BYTES = 32;

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

/** Resolved on each call so a missing key fails at use, not at import. */
function defaultKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing required environment variable: TOKEN_ENCRYPTION_KEY");
  return parseKey(raw);
}

export function encryptToken(plaintext: string, key: Buffer = defaultKey()): string {
  if (!plaintext) throw new Error("Refusing to encrypt an empty token");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptToken(stored: string, key: Buffer = defaultKey()): string {
  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted token");
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported token encryption version: ${version}`);
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  // Throws on mismatch, which is the whole point of GCM.
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** True if a stored value looks like our ciphertext rather than a raw token. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`) && value.split(":").length === 4;
}
