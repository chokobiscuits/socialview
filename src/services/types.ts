import type { Platform } from "@/generated/prisma/enums";

/** One video's current stats, normalized across platforms. */
export type VideoStatDTO = {
  externalId: string;
  title: string;
  thumbnailUrl?: string;
  permalink?: string;
  publishedAt?: Date;
  views: number;
  likes?: number;
  comments?: number;
};

/** Everything an adapter needs to read a connected account. */
export type ConnectionContext = {
  connectionId: string;
  externalAccountId: string;
  /** Already decrypted and already refreshed by the token manager. */
  accessToken: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt?: Date;
  refreshExpiresAt?: Date;
};

export type ConnectedAccount = {
  externalAccountId: string;
  displayName?: string;
  avatarUrl?: string;
};

/**
 * Every platform implements this, so the sync orchestrator never branches on
 * which platform it is talking to.
 */
export interface PlatformAdapter {
  readonly platform: Platform;

  /** The provider's authorize URL, for the "connect an account" redirect. */
  authorizeUrl(state: string, redirectUri: string): string;

  /** Trade an OAuth code for tokens plus the identity of the connected account. */
  exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{ tokens: TokenSet; account: ConnectedAccount }>;

  /** Mint a fresh access token. Throws TokenRevokedError if the grant is gone. */
  refresh(refreshToken: string): Promise<TokenSet>;

  /**
   * All of the creator's videos with current stats. An async generator so the
   * orchestrator can stream and throttle pages rather than buffering an entire
   * library into memory.
   */
  fetchVideoStats(ctx: ConnectionContext): AsyncIterable<VideoStatDTO>;
}

/**
 * The user revoked access, or the refresh token expired. Unrecoverable without
 * the user re-consenting, so the sync job flips the connection to NEEDS_REAUTH
 * rather than retrying.
 */
export class TokenRevokedError extends Error {
  constructor(
    readonly platform: Platform,
    message: string,
  ) {
    super(message);
    this.name = "TokenRevokedError";
  }
}

/** A non-2xx response from a platform API. */
export class PlatformApiError extends Error {
  constructor(
    readonly platform: Platform,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}
