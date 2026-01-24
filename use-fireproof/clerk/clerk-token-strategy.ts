import type { DashboardApiImpl } from "@fireproof/core-protocols-dashboard";
import type { TokenStrategie, TokenAndClaims, ToCloudOpts } from "@fireproof/core-types-protocols-cloud";
import type { SuperThis } from "@fireproof/core-types-base";
import type { Logger } from "@adviser/cement";

/**
 * Token strategy that uses Clerk authentication with the Fireproof Dashboard API.
 * Handles user provisioning and cloud token generation.
 */
export class ClerkTokenStrategy implements TokenStrategie {
  private dashApi: DashboardApiImpl<unknown>;
  private apiUrl: string;
  private lastExpiryMs: number | null = null;

  constructor(dashApi: DashboardApiImpl<unknown>, apiUrl: string) {
    this.dashApi = dashApi;
    this.apiUrl = apiUrl;
  }

  /**
   * Get the expiry time (in ms since epoch) of the last token obtained.
   * Returns null if no token has been obtained yet.
   */
  getLastTokenExpiry(): number | null {
    return this.lastExpiryMs;
  }

  hash(): string {
    return this.apiUrl;
  }

  open(): void {
    // No-op for Clerk strategy
  }

  tryToken(): Promise<TokenAndClaims | undefined> {
    return Promise.resolve(undefined);
  }

  async waitForToken(
    _sthis: SuperThis,
    logger: Logger,
    deviceId: string,
    opts: ToCloudOpts
  ): Promise<TokenAndClaims | undefined> {
    // Ensure user exists in dashboard database
    const rUser = await this.dashApi.ensureUser({});
    if (rUser.isErr()) {
      logger.Error().Err(rUser).Msg("Failed to ensure user");
      return undefined;
    }

    // Get cloud token with app ID from context or generate from deviceId
    const appId = (opts.context.get("appId") as string | undefined) || `clerk-${deviceId}`;
    const rRes = await this.dashApi.ensureCloudToken({ appId });
    if (rRes.isErr()) {
      logger.Error().Err(rRes).Msg("Failed to get cloud token");
      return undefined;
    }

    const res = rRes.Ok();
    // Store expiry time for proactive refresh scheduling
    if (res.expiresDate) {
      this.lastExpiryMs = new Date(res.expiresDate).getTime();
    }
    return {
      token: res.cloudToken,
      ...res,
    };
  }

  stop(): void {
    // No-op
  }
}
