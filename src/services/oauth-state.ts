import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * The OAuth `state` parameter. It must survive a round trip through the
 * provider untampered, so we HMAC it rather than trusting whatever comes back.
 *
 * Without this, an attacker could hand a victim a crafted callback URL and
 * bind *their* YouTube channel to the attacker's SocialView account (or the
 * reverse). Binding the userId into the signed payload closes that.
 *
 * Format: <base64url(payload)>.<base64url(hmac)>
 */

const MAX_AGE_MS = 10 * 60 * 1000; // A consent screen shouldn't take 10 minutes.

type StatePayload = {
  userId: string;
  platform: string;
  /** Random, so two connect attempts never produce the same state. */
  nonce: string;
  issuedAt: number;
};

function sign(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function secretFrom(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.AUTH_SECRET;
  if (!s) throw new Error("Missing required environment variable: AUTH_SECRET");
  return s;
}

export function createState(
  userId: string,
  platform: string,
  secret: string = secretFrom(),
): string {
  const payload: StatePayload = {
    userId,
    platform,
    nonce: randomBytes(12).toString("base64url"),
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = sign(encoded, secret).toString("base64url");
  return `${encoded}.${mac}`;
}

/** Throws unless the state is authentic, unexpired, and for this platform. */
export function verifyState(
  state: string,
  expectedPlatform: string,
  secret: string = secretFrom(),
): StatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Malformed OAuth state");
  const [encoded, mac] = parts;

  const expected = sign(encoded, secret);
  const actual = Buffer.from(mac, "base64url");
  // Constant-time, and length-checked first since timingSafeEqual throws on
  // mismatched lengths.
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new Error("OAuth state signature mismatch");
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  } catch {
    throw new Error("Malformed OAuth state payload");
  }

  if (payload.platform !== expectedPlatform) {
    throw new Error("OAuth state platform mismatch");
  }
  if (Date.now() - payload.issuedAt > MAX_AGE_MS) {
    throw new Error("OAuth state expired");
  }
  return payload;
}
