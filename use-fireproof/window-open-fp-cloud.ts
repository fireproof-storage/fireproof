import { FPCCEvtNeedsLogin } from "@fireproof/cloud-connector-base";
import DOMPurify from "dompurify";
import { ensureLogger, ensureSuperThis, hashObjectSync } from "@fireproof/core-runtime";
import { Logger } from "@adviser/cement";
import { defaultOverlayCss, defaultOverlayHtml } from "./overlay-html-defaults.js";
import { SuperThis } from "@fireproof/core-types-base";
import { RedirectStrategyOpts } from "./redirect-strategy.js";
import { FPCloudFrontend } from "@fireproof/cloud-connector-page";


export interface FPCloudFrontendImplOpts extends RedirectStrategyOpts {
  readonly sthis: SuperThis;
  readonly title: string;
}

export class FPCloudFrontendImpl implements FPCloudFrontend {
  readonly logger: Logger;
  readonly sthis: SuperThis;
  readonly overlayCss: string;
  readonly overlayHtml: (redirectLink: string) => string;
  readonly title: string;

  overlayNode?: HTMLDivElement;

  constructor(readonly opts: Partial<FPCloudFrontendImplOpts> = {}) {
    this.sthis = opts.sthis ?? ensureSuperThis();
    this.logger = ensureLogger(this.sthis, "FPCloudFrontendImpl");

    this.overlayCss = opts.overlayCss ?? defaultOverlayCss();
    this.overlayHtml = opts.overlayHtml ?? defaultOverlayHtml;
    this.title = opts.title ?? "Fireproof Login";
  }

  hash(): string {
    return hashObjectSync({
      overlayCss: this.overlayCss,
      overlayHtml: this.overlayHtml(""),
      title: this.title,
    });
  }

  stop(): void {
    this.logger.Debug().Msg("stop called");
    this.overlayNode?.remove();
    this.overlayNode = undefined;
  }

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
      const myHtml = this.overlayHtml(msg.loginURL);
      console.log("FPCloudConnectStrategy openFireproofLogin creating overlay with html", myHtml);
      overlayNode.innerHTML = DOMPurify.sanitize(myHtml);
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

  }
}
