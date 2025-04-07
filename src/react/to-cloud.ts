/// <reference lib="dom" />

import { BuildURI, Logger, ResolveOnce, URI } from "@adviser/cement";
import { Attachable, bs, ensureLogger, Ledger, FPContext, hashObject, falsyToUndef } from "@fireproof/core";
import { sleep } from "../../tests/helpers.js";
import { decodeJwt } from "jose/jwt/decode";

export interface DashBoardUIStrategie {
  open(logger: Logger, deviceId: string): void;

  gatherToken(logger: Logger, tokenKey: string): Promise<string | undefined>;

  waitForToken(logger: Logger, deviceId: string): Promise<string | undefined>;
}

export const ToCloudName = "toCloud";
interface ToCloudOpts {
  readonly name: string; // default "toCloud"
  readonly interval: number; // default 1000 or 1 second
  readonly tokenKey: string; // default "fpToken"
  readonly refreshTokenPreset: number; // default 2 minutes this is the time before the token expires
  readonly dashboardURI: string; // https://dev.connect.fireproof.direct/fp/cloud/api/token

  readonly strategy: DashBoardUIStrategie;
}

export class RedirectStrategy implements DashBoardUIStrategie {
  readonly opts: Omit<ToCloudOpts, "strategy">;

  constructor(opts: Omit<ToCloudOpts, "strategy">) {
    this.opts = opts;
  }

  open(_logger: Logger, deviceId: string) {
    const url = BuildURI.from(this.opts.dashboardURI)
      .setParam("back_url", window.location.href)
      .setParam("local_ledger_name", deviceId)
      .toString();
    window.location.href = url;
  }

  async gatherToken(logger: Logger, tokenKey: string): Promise<string | undefined> {
    const uri = URI.from(window.location.href);
    const uriFpToken = uri.getParam(tokenKey);
    if (uriFpToken) {
      localStorage.setItem(this.opts.tokenKey, uriFpToken);
      logger.Debug().Any({ uriFpToken }).Msg("Token set");
      window.location.href = uri.build().delParam(tokenKey).toString();
    }
    return falsyToUndef(localStorage.getItem(this.opts.tokenKey));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async waitForToken(logger: Logger, deviceId: string): Promise<string | undefined> {
    await sleep(10000);
    throw new Error("waitForToken not working on redirect strategy");
  }
}

export class IframeStrategy implements DashBoardUIStrategie {
  readonly opts: Omit<ToCloudOpts, "strategy">;

  constructor(opts: Omit<ToCloudOpts, "strategy">) {
    this.opts = opts;
  }

  fpIframeOverlay() {
    const div = document.createElement("div");
    div.id = "fpIframeOverlay";
    div.style.position = "fixed";
    // div.style.padding = "5px";
    div.style.top = "0";
    div.style.left = "0";
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    div.style.zIndex = "9999";
    div.style.justifyContent = "center";
    div.style.alignItems = "center";
    div.style.color = "black";
    div.style.overflow = "hidden";
    return div;
  }
  nestedDiv() {
    const div = document.createElement("div");
    div.style.backgroundColor = "#444";
    div.style.padding = "5px";
    div.style.borderRadius = "10px";
    div.style.color = "block";
    div.style.width = "100%";
    div.style.height = "100%";
    return div;
  }

  closeButton() {
    const button = document.createElement("button");
    button.innerText = "Close";
    button.style.position = "absolute";
    button.style.top = "10px";
    button.style.right = "10px";
    button.style.padding = "10px 15px";
    button.style.backgroundColor = "#f0f0f0";
    button.style.border = "1px solid #ccc";
    button.style.cursor = "pointer";
    button.style.zIndex = "10000"; // Ensure it's above the overlay
    button.onclick = () => {
      console.log("close");
    };
    return button;
  }

  overlayIframe(src: string) {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.zIndex = "9999";
    return iframe;
  }

  overlayDiv(deviceId: string) {
    const nestedDiv = this.nestedDiv();
    nestedDiv.appendChild(this.closeButton());
    nestedDiv.appendChild(this.overlayIframe(BuildURI.from(this.opts.dashboardURI).setParam("deviceId", deviceId).toString()));
    const ret = this.fpIframeOverlay();
    ret.appendChild(nestedDiv);
    return ret;
  }

  open(_logger: Logger, deviceId: string) {
    document.body.appendChild(this.overlayDiv(deviceId));
  }
  async gatherToken(logger: Logger): Promise<string | undefined> {
    const uri = URI.from(window.location.href);
    const uriFpToken = uri.getParam(this.opts.tokenKey);
    if (uriFpToken) {
      localStorage.setItem(this.opts.tokenKey, uriFpToken);
      logger.Debug().Any({ uriFpToken }).Msg("Token set");
      window.location.href = uri.build().delParam(this.opts.tokenKey).toString();
    }
    return falsyToUndef(localStorage.getItem(this.opts.tokenKey));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async waitForToken(logger: Logger, deviceId: string): Promise<string | undefined> {
    // throw new Error("waitForToken not implemented");
    return new Promise(() => {
      /* */
    });
  }
}

function defaultOpts(opts: Partial<ToCloudOpts>): ToCloudOpts {
  const defOpts = {
    name: ToCloudName,
    interval: 1000,
    refreshTokenPreset: 2 * 60 * 1000, // 2 minutes
    tokenKey: "fpToken",
    dashboardURI: "https://dev.connect.fireproof.direct/fp/cloud/api/token",
    ...opts,
  };
  return {
    ...defOpts,
    strategy: defOpts.strategy || new RedirectStrategy(defOpts),
  };
}

interface ToCloudAttachable extends Attachable {
  resetToken(): void;
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
      const token = await this.opts.strategy.gatherToken(logger, this.opts.tokenKey);
      if (!token) {
        logger.Debug().Msg("waiting for token");
        this.opts.strategy.open(logger, ledger.name);
        const token = await this.opts.strategy.waitForToken(logger, ledger.name);
        if (!token) {
          throw new Error("Token not found");
        }
        return toTokenAndClaims(token);
      }
      const tc = toTokenAndClaims(token);
      if (!this.currentToken) {
        logger.Debug().Msg("set current token");
        this.currentToken = tc;
        return tc;
      }
      if (tc.token === this.currentToken.token) {
        const now = new Date().getTime();
        if (this.currentToken?.claims.exp - this.opts.refreshTokenPreset < now) {
          logger.Debug().Any(tc.claims).Msg("token expired");
          this.opts.strategy.open(logger, ledger.name);
          const token = await this.opts.strategy.waitForToken(logger, ledger.name);
          if (!token) {
            throw new Error("Token not found");
          }
          return toTokenAndClaims(token);
        }
        return tc;
      }
      logger.Debug().Msg("Token changed");
      this.currentToken = tc;
      return tc;
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

  constructor(opts: Partial<ToCloudOpts>) {
    this.opts = defaultOpts(opts);
  }

  get name(): string {
    return this.opts.name;
  }

  private _tokenObserver!: TokenObserver;

  resetToken() {
    // console.log("resetToken", this.opts.tokenKey);
    localStorage.removeItem(this.opts.tokenKey);
    this._tokenObserver?.reset();
  }

  configHash() {
    return hashObject(this.opts);
  }
  doRedirect(logger: Logger, name: string) {
    const url = BuildURI.from(this.opts.dashboardURI)
      .setParam("back_url", window.location.href)
      .setParam("local_ledger_name", name)
      .toString();
    logger.Debug().Url(url).Msg("gathering token");
    window.location.href = url;
  }

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
      // console.log("intercepting with ", token);
      return uri.build().setParam("authJWK", token).URI();
    });
    return {
      car: { url: "memory://car", gatewayInterceptor },
      file: { url: "memory://file", gatewayInterceptor },
      meta: { url: "memory://meta", gatewayInterceptor },
      teardown: () => {
        this._tokenObserver.stop();
      },
      ctx: new FPContext().set(this.name, {
        token: () => this._tokenObserver.currentToken?.token,
        resetToken: () => this.resetToken(),
      } satisfies ToCloudCtx),
    };
  }
}

export interface ToCloudCtx {
  token(): string | undefined;
  resetToken(): void;
}

export function toCloud(iopts: Partial<ToCloudOpts> = {}): ToCloudAttachable {
  return new ToCloud(iopts);
}
