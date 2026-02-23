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
  private resolvedLedgerId: string | null = null;

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

  /**
   * Get the resolved ledger ID from the last ensureCloudToken call.
   * Returns null if no token has been obtained yet.
   */
  getLedgerId(): string | null {
    return this.resolvedLedgerId;
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

    // Check for shared ledger (role=member) before creating a new one.
    // Without passing the ledger param, ensureCloudToken creates a per-user
    // ledger, causing invited users to fork instead of syncing together.
    let ledgerParam: string | undefined;
    try {
      const rLedgers = await this.dashApi.listLedgersByUser({});
      if (rLedgers.isOk()) {
        const ledgers = rLedgers.Ok().ledgers || [];
        const userId = rUser.Ok().user.userId;
        const shared = ledgers.find((l: any) =>
          l.users?.some((u: any) => u.userId === userId && u.role === "member")
        );
        if (shared) {
          ledgerParam = shared.ledgerId;
          logger.Info().Str("ledgerId", shared.ledgerId).Msg("Using shared ledger");
        }
      }
    } catch {
      // Shared ledger lookup is best-effort; fall through to default behavior
    }

    const rRes = await this.dashApi.ensureCloudToken({ appId, ledger: ledgerParam });
    if (rRes.isErr()) {
      logger.Error().Err(rRes).Msg("Failed to get cloud token");
      return undefined;
    }

    const res = rRes.Ok();
    // Store expiry time for proactive refresh scheduling
    if (res.expiresDate) {
      this.lastExpiryMs = new Date(res.expiresDate).getTime();
    }
    if (res.ledger) {
      this.resolvedLedgerId = res.ledger;
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
