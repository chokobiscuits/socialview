import "server-only";
import { parseKey } from "./crypto";

/**
 * Server-side secrets, read lazily so importing this module never throws at
 * build time. Each getter fails loudly the first time a missing value is
 * actually needed, which beats silently encrypting with `undefined`.
 *
 * `server-only` makes it a build error if this ever reaches a client bundle.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  get tokenEncryptionKey(): Buffer {
    return parseKey(required("TOKEN_ENCRYPTION_KEY"));
  },
  get cronSecret(): string {
    return required("CRON_SECRET");
  },
  get googleClientId(): string {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret(): string {
    return required("GOOGLE_CLIENT_SECRET");
  },
  /** TikTok calls it a client *key*, not a client id. */
  get tiktokClientKey(): string {
    return required("TIKTOK_CLIENT_KEY");
  },
  get tiktokClientSecret(): string {
    return required("TIKTOK_CLIENT_SECRET");
  },
  get instagramAppId(): string {
    return required("INSTAGRAM_APP_ID");
  },
  get instagramAppSecret(): string {
    return required("INSTAGRAM_APP_SECRET");
  },
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  },
};
