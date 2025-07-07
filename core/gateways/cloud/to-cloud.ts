import { BuildURI, CoerceURI, Logger, ResolveOnce, URI, AppContext } from "@adviser/cement";
import { Ledger } from "@fireproof/core-types-base";
import {
  FPCloudClaim,
  FPCloudUri,
  ToCloudAttachable,
  ToCloudBase,
  ToCloudName,
  ToCloudOptionalOpts,
  ToCloudOpts,
  ToCloudRequiredOpts,
  TokenAndClaims,
  TokenStrategie,
} from "@fireproof/core-types-protocols-cloud";
import { ensureLogger, hashObject } from "@fireproof/core-runtime";
import { decodeJwt } from "jose/jwt/decode";
import { URIInterceptor } from "@fireproof/core-gateways-base";

function addTenantAndLedger(opts: ToCloudOptionalOpts, uri: CoerceURI): URI {
  const buri = BuildURI.from(uri);
  if (opts.tenant) {
    buri.setParam("tenant", opts.tenant);
  }
  if (opts.ledger) {
    buri.setParam("ledger", opts.ledger);
  }
  return buri.URI();
}

function defaultOpts(opts: ToCloudOptionalOpts): ToCloudOpts {
  const base = opts.urls?.base ?? "fpcloud://fireproof-v2-cloud-dev.jchris.workers.dev";
  const param = {
    car: addTenantAndLedger(opts, opts.urls?.car ?? base),
    file: addTenantAndLedger(opts, opts.urls?.file ?? base),
    meta: addTenantAndLedger(opts, opts.urls?.meta ?? base),
  } satisfies FPCloudUri;
  const defOpts = {
    name: ToCloudName,
    intervalSec: 1,
    tokenWaitTimeSec: 90, // 90 seconds
    refreshTokenPresetSec: 2 * 60, // 2 minutes
    ...opts,
    events: opts.events ?? {
      changed: async () => {
        /* no-op */
      },
    },
    context: opts.context ?? new AppContext(),
    urls: param,
    strategy: opts.strategy ?? new SimpleTokenStrategy(""),
  } satisfies ToCloudOpts;
  return defOpts;
}

// function toTokenAndClaims(token: string): TokenAndClaims {
//   const claims = decodeJwt(token);
//   return {
//     token,
//     claims: {
//       ...claims,
//       exp: claims.exp || 0,
//     } as FPCloudClaim,
//   };
// }

function definedExp(exp?: number): number {
  if (typeof exp === "number") {
    return exp;
  }
  return new Date().getTime() / 1000;
}

class TokenObserver {
  private readonly opts: ToCloudOpts;

  currentTokenAndClaim?: TokenAndClaims;

  constructor(opts: ToCloudOpts) {
    this.opts = opts;
  }

  async start() {
    return;
  }

  async stop() {
    // clear pending refresh token
    return;
  }

  async refreshToken(logger: Logger, ledger: Ledger) {
    let token = await this.opts.strategy.tryToken(ledger.sthis, logger, this.opts);
    // console.log("refreshToken", token);
    if (this.isExpired(token)) {
      logger.Debug().Msg("waiting for token");
      this.opts.strategy.open(ledger.sthis, logger, ledger.name, this.opts);
      token = await this.opts.strategy.waitForToken(ledger.sthis, logger, ledger.name, this.opts);
      if (!token) {
        throw new Error("Token not found");
      }
    }
    return token;
  }

  isExpired(token?: TokenAndClaims): boolean {
    const now = ~~(new Date().getTime() / 1000); // current time in seconds
    return !token || definedExp(token.claims.exp) - this.opts.refreshTokenPresetSec < now;
  }

  readonly _token = new ResolveOnce<TokenAndClaims>();
  async getToken(logger: Logger, ledger: Ledger): Promise<TokenAndClaims> {
    let activeTokenAndClaim = this.currentTokenAndClaim;
    if (this.isExpired(activeTokenAndClaim)) {
      // console.log("refreshing token", this.currentTokenAndClaim?.claims.exp);
      await this.opts.events?.changed(undefined);
      logger
        .Debug()
        .Any({ claims: this.currentTokenAndClaim?.claims, exp: definedExp(this.currentTokenAndClaim?.claims.exp) })
        .Msg("refresh token");
      activeTokenAndClaim = await this.refreshToken(logger, ledger);
    }

    if (activeTokenAndClaim && activeTokenAndClaim.token !== this.currentTokenAndClaim?.token) {
      this.currentTokenAndClaim = activeTokenAndClaim;
      await this.opts.events?.changed(activeTokenAndClaim);
    }
    if (this.currentTokenAndClaim) {
      return this.currentTokenAndClaim;
    }
    throw logger.Error().Msg("Token not found").AsError();
  }

  async reset() {
    this.currentTokenAndClaim = undefined;
    await this.opts.events?.changed(undefined);
    return;
  }
}

class ToCloud implements ToCloudAttachable {
  readonly opts: ToCloudOpts;
  currentToken?: string;

  constructor(opts: ToCloudOptionalOpts) {
    // console.log("ToCloud", opts);
    this.opts = defaultOpts(opts);
  }

  get name(): string {
    return this.opts.name;
  }

  private _tokenObserver!: TokenObserver;

  async configHash() {
    const hash = await hashObject(this.opts);
    // console.log("to-cloud-configHash", this.opts, hash);
    // console.log("to-cloud-configHash", hash, this.opts);
    return hash;
  }
  // doRedirect(logger: Logger, name: string) {
  //   const url = BuildURI.from(this.opts.dashboardURI)
  //     .setParam("back_url", window.location.href)
  //     .setParam("local_ledger_name", name)
  //     .toString();
  //   logger.Debug().Url(url).Msg("gathering token");
  //   window.location.href = url;
  // }

  get token(): string | undefined {
    return this.currentToken;
  }

  async prepare(ledger?: Ledger) {
    // console.log("prepare-1");
    if (!ledger) {
      throw new Error("Ledger is required");
    }
    const logger = ensureLogger(ledger.sthis, "ToCloud"); // .SetDebug("ToCloud");
    // console.log("ToCloud prepare", this.opts);

    this._tokenObserver = new TokenObserver(this.opts);
    await this._tokenObserver.start();

    // console.log("prepare");
    const gatewayInterceptor = URIInterceptor.withMapper(async (uri) => {
      // wait for the token
      const token = await this._tokenObserver.getToken(logger, ledger);
      // console.log("getToken", token)
      const buri = BuildURI.from(uri).setParam("authJWK", token.token);

      const selected = token.claims.selected ?? {};
      if (selected.tenant) {
        buri.setParam("tenant", selected.tenant);
      } else if (this.opts.tenant) {
        buri.setParam("tenant", this.opts.tenant);
      }
      if (selected.ledger) {
        buri.setParam("ledger", selected.ledger);
      } else if (this.opts.ledger) {
        buri.setParam("ledger", this.opts.ledger);
      }

      return buri.URI();
    });
    return {
      car: { url: this.opts.urls.car, gatewayInterceptor },
      file: { url: this.opts.urls.file, gatewayInterceptor },
      meta: { url: this.opts.urls.meta, gatewayInterceptor },
      teardown: () => {
        this._tokenObserver.stop();
      },
      ctx: this.opts.context,
    };
  }
}

// export interface ToCloudCtx {
//   token(): string | undefined;
//   resetToken(): void;
// }

export function toCloud(iopts: Partial<ToCloudBase> & ToCloudRequiredOpts): ToCloudAttachable {
  // console.log("toCloud", iopts);
  return new ToCloud({
    ...iopts,
    urls: iopts.urls ?? {},
    events: iopts.events ?? {
      changed: async () => {
        /* no-op */
      },
    },
    context: iopts.context ?? new AppContext(),
    strategy: iopts.strategy,
  });
}

export class SimpleTokenStrategy implements TokenStrategie {
  private tc: TokenAndClaims;
  constructor(jwk: string) {
    this.tc = {
      token: jwk,
      claims: decodeJwt(jwk) as FPCloudClaim,
    };
  }

  stop(): void {
    // console.log("SimpleTokenStrategy stop");
    return;
  }

  open(): void {
    // console.log("SimpleTokenStrategy open");
    return;
  }
  async tryToken(): Promise<TokenAndClaims | undefined> {
    // console.log("SimpleTokenStrategy gatherToken");
    return this.tc;
  }
  async waitForToken(): Promise<TokenAndClaims | undefined> {
    // console.log("SimpleTokenStrategy waitForToken");
    return this.tc;
  }
}
