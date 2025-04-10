import { CoerceURI, Logger, ResolveOnce, URI } from "@adviser/cement";
import { Attachable, bs, ensureLogger, Ledger, FPContext, hashObject } from "@fireproof/core";
import { decodeJwt } from "jose/jwt/decode";

export interface UITokenStrategie {
  open(logger: Logger, deviceId: string, opts: ToCloudOpts): void;
  gatherToken(logger: Logger, opts: ToCloudOpts): Promise<string | undefined>;
  waitForToken(logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<string | undefined>;
}

export const ToCloudName = "toCloud";

export interface FPCloudRef {
  readonly base: CoerceURI;
  readonly car: CoerceURI;
  readonly file: CoerceURI;
  readonly meta: CoerceURI;
}

interface ToCloudBase {
  readonly name: string; // default "toCloud"
  readonly interval: number; // default 1000 or 1 second
  readonly refreshTokenPreset: number; // default 2 minutes this is the time before the token expires
  readonly context: FPContext;
}

export interface ToCloudRequiredOpts {
  readonly fpCloud: Partial<FPCloudRef>;
  readonly strategy: UITokenStrategie;
}

export type ToCloudOpts = ToCloudRequiredOpts & ToCloudBase;

export type ToCloudOptionalOpts = ToCloudRequiredOpts & Partial<ToCloudBase>;

export interface FPCloudUri {
  readonly car: URI;
  readonly file: URI;
  readonly meta: URI;
}

function defaultOpts(opts: ToCloudOptionalOpts): ToCloudOpts {
  const base = opts.fpCloud?.base ?? "fpcloud://fireproof-v2-cloud-dev.jchris.workers.dev";
  const param = {
    car: URI.from(opts.fpCloud?.car ?? base),
    file: URI.from(opts.fpCloud?.file ?? base),
    meta: URI.from(opts.fpCloud?.meta ?? base),
  } satisfies FPCloudUri;
  const defOpts = {
    name: ToCloudName,
    interval: 1000,
    refreshTokenPreset: 2 * 60 * 1000, // 2 minutes

    ...opts,
    context: opts.context ?? new FPContext(),
    fpCloud: param,
  } satisfies ToCloudOpts;
  return defOpts;
}

export interface ToCloudAttachable extends Attachable {
  token?: string;
}

interface TokenAndClaims {
  readonly token: string;
  readonly claims: {
    readonly exp: number;
  };
}

function toTokenAndClaims(token: string): TokenAndClaims {
  const claims = decodeJwt(token);
  return {
    token,
    claims: {
      ...claims,
      exp: claims.exp || 0,
    },
  };
}

class TokenObserver {
  private readonly opts: ToCloudOpts;

  currentToken?: TokenAndClaims;

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

  readonly _token = new ResolveOnce<TokenAndClaims>();
  async getToken(logger: Logger, ledger: Ledger): Promise<string> {
    // console.log("getToken", this.opts.tokenKey);
    const tc = await this._token.once(async () => {
      const token = await this.opts.strategy.gatherToken(logger, this.opts);
      if (!token) {
        logger.Debug().Msg("waiting for token");
        this.opts.strategy.open(logger, ledger.name, this.opts);
        const token = await this.opts.strategy.waitForToken(logger, ledger.name, this.opts);
        if (!token) {
          throw new Error("Token not found");
        }
        return toTokenAndClaims(token);
      }
      const tc = toTokenAndClaims(token);
      if (!this.currentToken) {
        logger
          .Debug()
          .Any({ tc, diff: new Date().getTime() - tc.claims.exp })
          .Msg("set current token");
        this.currentToken = tc;
        // return tc;
      }
      // if (tc.token === this.currentToken.token) {
      const now = new Date().getTime();
      if (this.currentToken?.claims.exp - this.opts.refreshTokenPreset < now) {
        logger.Debug().Any(tc.claims).Msg("token expired");
        this.opts.strategy.open(logger, ledger.name, this.opts);
        const token = await this.opts.strategy.waitForToken(logger, ledger.name, this.opts);
        if (!token) {
          throw new Error("Token not found");
        }
        return toTokenAndClaims(token);
      }
      return tc;
      // }
      // logger.Debug().Msg("Token changed");
      // this.currentToken = tc;
      // return tc;
    });
    return tc.token;
  }

  reset() {
    this._token.reset();
    this.currentToken = undefined;
    return;
  }
}

class ToCloud implements ToCloudAttachable {
  readonly opts: ToCloudOpts;
  currentToken?: string;

  constructor(opts: ToCloudOptionalOpts) {
    this.opts = defaultOpts(opts);
  }

  get name(): string {
    return this.opts.name;
  }

  private _tokenObserver!: TokenObserver;

  async configHash() {
    const hash = await hashObject(this.opts);
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
    if (!ledger) {
      throw new Error("Ledger is required");
    }
    const logger = ensureLogger(ledger.sthis, "ToCloud").SetDebug("ToCloud");
    // console.log("ToCloud prepare", this.opts);

    this._tokenObserver = new TokenObserver(this.opts);
    await this._tokenObserver.start();

    const gatewayInterceptor = bs.URIInterceptor.withMapper(async (uri) => {
      // wait for the token
      // console.log("waiting intercepting uri", uri);
      const token = await this._tokenObserver.getToken(logger, ledger);
      console.log("intercepting with ", uri.toString(), token);
      return uri.build().setParam("authJWK", token).URI();
    });
    return {
      car: { url: this.opts.fpCloud.car, gatewayInterceptor },
      file: { url: this.opts.fpCloud.file, gatewayInterceptor },
      meta: { url: this.opts.fpCloud.meta, gatewayInterceptor },
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

export function toCloud(iopts: ToCloudOptionalOpts): ToCloudAttachable {
  return new ToCloud(iopts);
}

export class SimpleTokenStrategy implements UITokenStrategie {
  private jwk: string;
  constructor(jwk: string) {
    this.jwk = jwk;
  }
  open(): void {
    return;
  }
  async gatherToken(): Promise<string | undefined> {
    return this.jwk;
  }
  async waitForToken(): Promise<string | undefined> {
    return this.jwk;
  }
}
