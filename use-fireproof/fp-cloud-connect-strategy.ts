import { Future, KeyedResolvOnce, Lazy, Logger, ResolveSeq, URI } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { ToCloudOpts, TokenAndClaims, TokenStrategie } from "@fireproof/core-types-protocols-cloud";
import { ensureLogger, ensureSuperThis, hashObjectSync } from "@fireproof/core-runtime";
import { RedirectStrategyOpts } from "./redirect-strategy.js";
import { defaultOverlayCss, defaultOverlayHtml } from "./html-defaults.js";

import { initializeIframe } from "./fp-cloud-connector/page-handler.js";
import { PageFPCCProtocol } from "./fp-cloud-connector/page-fpcc-protocol.js";
import { FPCCEvtNeedsLogin } from "./fp-cloud-connector/protocol-fp-cloud-conn.js";
import DOMPurify from "dompurify";
import { dbAppKey } from "./fp-cloud-connector/iframe-fpcc-protocol.js";

export interface FPCloudConnectOpts extends RedirectStrategyOpts {
  readonly fpCloudConnectURL: string;
  readonly title?: string;
  readonly sthis?: SuperThis;
}

// open(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): void;
// tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
// waitForToken(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
// stop(): void;

const ppageProtocolInstances = new KeyedResolvOnce<PageFPCCProtocol>();

function ppageProtocolKey(iframeSrc: string): string {
  if (!iframeSrc) {
    iframeSrc = "./injected-iframe.html";
  }
  let iframeHref: URI;
  if (typeof iframeSrc === "string" && iframeSrc.match(/^[./]/)) {
    // Infer the path to in-iframe.js from the current module's location
    // eslint-disable-next-line no-restricted-globals
    const scriptUrl = new URL(import.meta.url);
    // eslint-disable-next-line no-restricted-globals
    iframeHref = URI.from(new URL(iframeSrc, scriptUrl).href);
  } else {
    iframeHref = URI.from(iframeSrc);
  }
  return iframeHref.toString();
}

const registerLocalDbNames = new KeyedResolvOnce<Promise<void>, string>();

export class FPCloudConnectStrategy implements TokenStrategie {
  overlayNode?: HTMLDivElement;
  waitState: "started" | "stopped" = "stopped";

  readonly overlayCss: string;
  readonly overlayHtml: (redirectLink: string) => string;
  readonly title: string;
  readonly fpCloudConnectURL: string;
  readonly sthis: SuperThis;
  readonly logger: Logger;

  constructor(opts: Partial<FPCloudConnectOpts> = {}) {
    this.overlayCss = opts.overlayCss ?? defaultOverlayCss();
    this.overlayHtml = opts.overlayHtml ?? defaultOverlayHtml;
    this.fpCloudConnectURL = opts.fpCloudConnectURL ?? "./injected-iframe.html";
    this.title = opts.title ?? "Fireproof Login";
    this.sthis = opts.sthis ?? ensureSuperThis();
    this.logger = ensureLogger(this.sthis, "FPCloudConnectStrategy");
  }
  readonly hash = Lazy(() =>
    hashObjectSync({
      overlayCss: this.overlayCss,
      overlayHtml: this.overlayHtml("X").toString(),
      fpCloudConnectURL: this.fpCloudConnectURL,
    }),
  );

  openFireproofLogin(msg: FPCCEvtNeedsLogin): void {
    // const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    this.logger.Debug().Url(msg.loginURL).Msg("open redirect");

    let overlayNode = document.body.querySelector("#fpOverlay") as HTMLDivElement;
    if (!overlayNode) {
      const styleNode = document.createElement("style");
      styleNode.innerHTML = DOMPurify.sanitize(this.overlayCss);
      document.head.appendChild(styleNode);
      overlayNode = document.createElement("div") as HTMLDivElement;
      overlayNode.id = "fpOverlay";
      overlayNode.className = "fpOverlay";
      overlayNode.innerHTML = DOMPurify.sanitize(this.overlayHtml(msg.loginURL));
      document.body.appendChild(overlayNode);
      overlayNode.querySelector(".fpCloseButton")?.addEventListener("click", () => {
        if (overlayNode) {
          if (overlayNode.style.display === "block") {
            overlayNode.style.display = "none";
            this.stop();
          } else {
            overlayNode.style.display = "block";
          }
        }
      });
    }
    overlayNode.style.display = "block";
    this.overlayNode = overlayNode;
    const width = 800;
    const height = 600;
    const parentScreenX = window.screenX || window.screenLeft; // Cross-browser compatibility
    const parentScreenY = window.screenY || window.screenTop; // Cross-browser compatibility

    // Get the parent window's outer dimensions (including chrome)
    const parentOuterWidth = window.outerWidth;
    const parentOuterHeight = window.outerHeight;

    // Calculate the left position for the new window
    // Midpoint of parent window's width - half of new window's width
    const left = parentScreenX + parentOuterWidth / 2 - width / 2;

    // Calculate the top position for the new window
    // Midpoint of parent window's height - half of new window's height
    const top = parentScreenY + parentOuterHeight / 2 - height / 2;

    window.open(
      // eslint-disable-next-line no-restricted-globals
      new URL(msg.loginURL),
      this.title,
      `left=${left},top=${top},width=${width},height=${height},scrollbars=yes,resizable=yes,popup=yes`,
    );
    // window.location.href = url.toString();
  }

  readonly openloginSeq = new ResolveSeq();
  readonly waitForTokenPerKey = new KeyedResolvOnce<Future<TokenAndClaims>>();

  getPageProtocol(sthis: SuperThis): Promise<PageFPCCProtocol> {
    const key = ppageProtocolKey(this.fpCloudConnectURL);
    return ppageProtocolInstances.get(key).once(async () => {
      const ppage = new PageFPCCProtocol(sthis, { iframeHref: key });
      await ppage.ready();
      ppage.onFPCCEvtNeedsLogin((msg) => {
        this.openloginSeq.add(() => {
          // test if all dbs are ready
          console.log("FPCloudConnectStrategy detected needs login event");
          this.openFireproofLogin(msg);
        });
        // logger.Info().Msg("FPCloudConnectStrategy detected needs login event");
      });
      this.waitForTokenPerKey.get(key).once(() => new Future<void>());
      ppage.onFPCCEvtApp((evt) => {
        const key = dbAppKey({ appId: evt.appId, dbName: evt.localDb.dbName });
        const future = this.waitForTokenPerKey.get(key)?.value;
        if (future) {
          future.resolve({
            token: evt.localDb.accessToken,
            claims: {} as TokenAndClaims["claims"],
          });
        }
      });
      return ppage.ready();
    });
  }

  open(sthis: SuperThis, logger: Logger, localDbName: string, _opts: ToCloudOpts) {
    return this.getPageProtocol(sthis).then((ppage) => {
      return registerLocalDbNames.get(`${localDbName}:${ppage.getAppId()}:${ppage.dst}`).once(() => {
        return initializeIframe(ppage).then((proto) => {
          console.log("FPCloudConnectStrategy open isReady", localDbName);
          return proto.registerDatabase(localDbName).then((evt) => {
            console.log("FPCloudConnectStrategy open registered", evt);
          });
        });
      });
    });
  }

  // private currentToken?: TokenAndClaims;

  // waiting?: ReturnType<typeof setTimeout>;

  stop() {
    console.log("FPCloudConnectStrategy stop called");
    // if (this.waiting) {
    //   clearTimeout(this.waiting);
    //   this.waiting = undefined;
    // }
    // this.waitState = "stopped";
  }

  async tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined> {
    console.log("FPCloudConnectStrategy tryToken called", opts);
    // if (!this.currentToken) {
    //   const webCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    //   this.currentToken = await webCtx.token();
    //   // console.log("RedirectStrategy tryToken - ctx", this.currentToken);
    // }
    // return this.currentToken;
    return undefined;
  }

  async waitForToken(
    _sthis: SuperThis,
    _logger: Logger,
    localDbName: string,
    _opts: ToCloudOpts,
  ): Promise<TokenAndClaims | undefined> {
    const ppage = await this.getPageProtocol(this.sthis);
    const key = dbAppKey({ appId: ppage.getAppId(), dbName: localDbName });
    const future = this.waitForTokenPerKey.get(key).value;
    if (future) {
      return future.asPromise();
    }
    throw this.logger.Error().Any({ key }).Msg("waitForToken should never be called her");
  }
}
