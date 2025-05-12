import { BuildURI, CoerceURI, Logger, ResolveOnce, URI, AppContext } from "@adviser/cement";
import { decodeJwt } from "jose/jwt/decode";
import { FPCloudClaim } from "../../../protocols/cloud/msg-types.js";
import { Attachable, Ledger, SuperThis } from "../../../types.js";
import { ensureLogger, hashObject } from "../../../utils.js";
import { URIInterceptor } from "../../../blockstore/uri-interceptor.js";

export interface TokenStrategie {
  open(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): void;
  tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
  waitForToken(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
  stop(): void;
}

export const ToCloudName = "toCloud";

export interface FPCloudRef {
  readonly base: CoerceURI;
  readonly car: CoerceURI;
  readonly file: CoerceURI;
  readonly meta: CoerceURI;
}

export interface TokenAndClaimsEvents {
  changed(token?: TokenAndClaims): Promise<void>;
}

interface ToCloudBase {
  readonly name: string; // default "toCloud"
  readonly interval: number; // default 1000 or 1 second
  readonly refreshTokenPreset: number; // default 2 minutes this is the time before the token expires
  readonly context: AppContext;
  readonly events: TokenAndClaimsEvents;
  readonly tenant?: string; // default undefined
  readonly ledger?: string; // default undefined
}

export interface ToCloudRequiredOpts {
  readonly urls: Partial<FPCloudRef>;
  readonly strategy: TokenStrategie;
  // readonly events: TokenAndClaimsEvents;
  // readonly context: AppContext;
  // readonly context: AppContext;
}

export type ToCloudOpts = ToCloudRequiredOpts & ToCloudBase;

export type ToCloudOptionalOpts = Partial<ToCloudBase> & ToCloudRequiredOpts;

export interface FPCloudUri {
  readonly car: URI;
  readonly file: URI;
  readonly meta: URI;
}

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
    interval: 1000,
    refreshTokenPreset: 2 * 60 * 1000, // 2 minutes
    ...opts,
    events: opts.events ?? {
      changed: async () => {
        /* no-op */
      },
    },
    context: opts.context ?? new AppContext(),
    urls: param,
  } satisfies ToCloudOpts;
  return defOpts;
}

export interface ToCloudAttachable extends Attachable {
  token?: string;
  readonly opts: ToCloudOpts;
}

export interface TokenAndClaims {
  readonly token: string;
  readonly claims: FPCloudClaim;
  //   readonly exp: number;
  //   readonly tenant?: string;
  //   readonly ledger?: string;
  // };
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
  return new Date().getTime();
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
    if (!token) {
      logger.Debug().Msg("waiting for token");
      this.opts.strategy.open(ledger.sthis, logger, ledger.name, this.opts);
      token = await this.opts.strategy.waitForToken(ledger.sthis, logger, ledger.name, this.opts);
      if (!token) {
        throw new Error("Token not found");
      }
    }
    return token;
  }

  readonly _token = new ResolveOnce<TokenAndClaims>();
  async getToken(logger: Logger, ledger: Ledger): Promise<TokenAndClaims> {
    const now = new Date().getTime();
    let activeTokenAndClaim = this.currentTokenAndClaim;
    if (!this.currentTokenAndClaim || definedExp(this.currentTokenAndClaim.claims.exp) - this.opts.refreshTokenPreset < now) {
      await this.opts.events?.changed(undefined);
      logger
        .Debug()
        .Any({ claims: this.currentTokenAndClaim?.claims, now, exp: definedExp(this.currentTokenAndClaim?.claims.exp) })
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
    const logger = ensureLogger(ledger.sthis, "ToCloud").SetDebug("ToCloud");
    // console.log("ToCloud prepare", this.opts);

    this._tokenObserver = new TokenObserver(this.opts);
    await this._tokenObserver.start();

    // console.log("prepare");
    const gatewayInterceptor = URIInterceptor.withMapper(async (uri) => {
      // wait for the token
      const token = await this._tokenObserver.getToken(logger, ledger);
      // console.log("getToken", token)
      const buri = BuildURI.from(uri).setParam("authJWK", token.token);

      if (token.claims.selected.tenant) {
        buri.setParam("tenant", token.claims.selected.tenant);
      } else if (this.opts.tenant) {
        buri.setParam("tenant", this.opts.tenant);
      }
      if (token.claims.selected.ledger) {
        buri.setParam("ledger", token.claims.selected.ledger);
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
