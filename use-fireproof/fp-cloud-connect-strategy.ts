import { Lazy, Logger } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { ToCloudOpts, TokenAndClaims, TokenStrategie } from "@fireproof/core-types-protocols-cloud";
import { hashObjectSync } from "@fireproof/core-runtime";
import { RedirectStrategyOpts } from "./redirect-strategy.js";
import { defaultOverlayCss, defaultOverlayHtml } from "./html-defaults.js";

import { initializeIframe } from "./fp-cloud-connector/page-handler.js";

export interface FPCloudConnectOpts extends RedirectStrategyOpts {
  readonly fpCloudConnectURL: string;
}

// open(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): void;
// tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
// waitForToken(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
// stop(): void;

export class FPCloudConnectStrategy implements TokenStrategie {
  resultId?: string;
  overlayNode?: HTMLDivElement;
  waitState: "started" | "stopped" = "stopped";

  readonly overlayCss: string;
  readonly overlayHtml: (redirectLink: string) => string;
  readonly fpCloudConnectURL: string;

  constructor(opts: Partial<FPCloudConnectOpts> = {}) {
    this.overlayCss = opts.overlayCss ?? defaultOverlayCss();
    this.overlayHtml = opts.overlayHtml ?? defaultOverlayHtml;
    this.fpCloudConnectURL = opts.fpCloudConnectURL ?? "./injected-iframe.html";
  }
  readonly hash = Lazy(() =>
    hashObjectSync({
      overlayCss: this.overlayCss,
      overlayHtml: this.overlayHtml("X").toString(),
      fpCloudConnectURL: this.fpCloudConnectURL,
    }),
  );

  open(sthis: SuperThis, logger: Logger, localDbName: string, _opts: ToCloudOpts) {
    initializeIframe({ iframeSrc: this.fpCloudConnectURL }).then((proto) => {
      console.log("FPCloudConnectStrategy open isReady", localDbName);

      return proto.registerDatabase(localDbName);

      // const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
      // logger.Debug().Url(redirectCtx.dashboardURI).Msg("open redirect");
      // this.resultId = sthis.nextId().str;
      // const url = BuildURI.from(redirectCtx.dashboardURI)
      //   .setParam("back_url", window.location.href)
      //   .setParam("result_id", this.resultId)
      //   .setParam("local_ledger_name", localDbName);

      // if (opts.ledger) {
      //   url.setParam("ledger", opts.ledger);
      // }
      // if (opts.tenant) {
      //   url.setParam("tenant", opts.tenant);
      // }

      // let overlayNode = document.body.querySelector("#fpOverlay") as HTMLDivElement;
      // if (!overlayNode) {
      //   const styleNode = document.createElement("style");
      //   styleNode.innerHTML = DOMPurify.sanitize(this.overlayCss);
      //   document.head.appendChild(styleNode);
      //   overlayNode = document.createElement("div") as HTMLDivElement;
      //   overlayNode.id = "fpOverlay";
      //   overlayNode.className = "fpOverlay";
      //   overlayNode.innerHTML = DOMPurify.sanitize(this.overlayHtml(url.toString()));
      //   document.body.appendChild(overlayNode);
      //   overlayNode.querySelector(".fpCloseButton")?.addEventListener("click", () => {
      //     if (overlayNode) {
      //       if (overlayNode.style.display === "block") {
      //         overlayNode.style.display = "none";
      //         this.stop();
      //       } else {
      //         overlayNode.style.display = "block";
      //       }
      //     }
      //   });
      // }
      // overlayNode.style.display = "block";
      // this.overlayNode = overlayNode;
      // const width = 800;
      // const height = 600;
      // const parentScreenX = window.screenX || window.screenLeft; // Cross-browser compatibility
      // const parentScreenY = window.screenY || window.screenTop; // Cross-browser compatibility

      // // Get the parent window's outer dimensions (including chrome)
      // const parentOuterWidth = window.outerWidth;
      // const parentOuterHeight = window.outerHeight;

      // // Calculate the left position for the new window
      // // Midpoint of parent window's width - half of new window's width
      // const left = parentScreenX + parentOuterWidth / 2 - width / 2;

      // // Calculate the top position for the new window
      // // Midpoint of parent window's height - half of new window's height
      // const top = parentScreenY + parentOuterHeight / 2 - height / 2;

      // window.open(
      //   url.asURL(),
      //   "Fireproof Login",
      //   `left=${left},top=${top},width=${width},height=${height},scrollbars=yes,resizable=yes,popup=yes`,
      // );
    });
    // window.location.href = url.toString();
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

  async waitForToken(_sthis: SuperThis, _logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<TokenAndClaims | undefined> {
    console.log("FPCloudConnectStrategy waitForToken called", deviceId, opts);
    return undefined;
  }
}
