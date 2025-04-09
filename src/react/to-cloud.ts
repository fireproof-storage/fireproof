/// <reference lib="dom" />

import { BuildURI, Logger, URI } from "@adviser/cement";
import { falsyToUndef, sleep, rt } from "@fireproof/core";
import { ToCloudOpts } from "../runtime/gateways/cloud/to-cloud.js";

export const WebCtx = "webCtx";

export interface WebToCloudCtx {
  readonly dashboardURI: string; // https://dev.connect.fireproof.direct/fp/cloud/api/token
  readonly uiURI: string; // default "https://dev.connect.fireproof.direct/api"
  readonly tokenKey: string;
  resetToken(): void;
  token(): string | undefined;
}

export function defaultWebToCloudOpts(opts: Partial<WebToCloudCtx>): WebToCloudCtx {
  return {
    dashboardURI: "https://dev.connect.fireproof.direct/fp/cloud/api/token",
    uiURI: "https://dev.connect.fireproof.direct/api",
    tokenKey: "fpToken",
    token: function () {
      return falsyToUndef(localStorage.getItem(this.tokenKey));
    },
    resetToken: function () {
      localStorage.removeItem(this.tokenKey);
    },
    ...opts,
  };
}

export class RedirectStrategy implements rt.gw.cloud.UITokenStrategie {
  // readonly opts: WebToCloudOpts;

  // constructor(opts: WebToCloudOpts) {
  //   this.opts = opts;
  // }

  open(logger: Logger, deviceId: string, opts: ToCloudOpts) {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    logger.Debug().Url(redirectCtx.dashboardURI).Msg("open redirect");
    const url = BuildURI.from(redirectCtx.dashboardURI)
      .setParam("back_url", window.location.href)
      .setParam("local_ledger_name", deviceId)
      .toString();
    window.location.href = url;
  }

  async gatherToken(logger: Logger, opts: ToCloudOpts): Promise<string | undefined> {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    const uri = URI.from(window.location.href);
    const uriFpToken = uri.getParam(redirectCtx.tokenKey);
    if (uriFpToken) {
      localStorage.setItem(redirectCtx.tokenKey, uriFpToken);
      logger.Debug().Any({ uriFpToken }).Msg("Token set");
      window.location.href = uri.build().delParam(redirectCtx.tokenKey).toString();
    }
    return falsyToUndef(localStorage.getItem(redirectCtx.tokenKey));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async waitForToken(logger: Logger, deviceId: string): Promise<string | undefined> {
    await sleep(100000);
    throw new Error("waitForToken not working on redirect strategy");
  }
}

// export class NeedLoginStrategy implements DashBoardUIStrategie {
//   readonly opts: Omit<ToCloudOpts, "strategy">;

//   constructor(opts: Omit<ToCloudOpts, "strategy">) {
//     this.opts = opts;
//   }

//   open(_logger: Logger, deviceId: string) {
//     fetch("https://dev.connect.fireproof.direct/api", {
//     })
//   }

//   async gatherToken(logger: Logger, tokenKey: string): Promise<string | undefined> {
//     const uri = URI.from(window.location.href);
//     const uriFpToken = uri.getParam(tokenKey);
//     if (uriFpToken) {
//       localStorage.setItem(this.opts.tokenKey, uriFpToken);
//       logger.Debug().Any({ uriFpToken }).Msg("Token set");
//       window.location.href = uri.build().delParam(tokenKey).toString();
//     }
//     return falsyToUndef(localStorage.getItem(this.opts.tokenKey));
//   }

//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   async waitForToken(logger: Logger, deviceId: string): Promise<string | undefined> {
//     await sleep(10000);
//     throw new Error("waitForToken not working on redirect strategy");
//   }
// }

export class IframeStrategy implements rt.gw.cloud.UITokenStrategie {
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

  overlayDiv(deviceId: string, dashboardURI: string) {
    const nestedDiv = this.nestedDiv();
    nestedDiv.appendChild(this.closeButton());
    nestedDiv.appendChild(this.overlayIframe(BuildURI.from(dashboardURI).setParam("deviceId", deviceId).toString()));
    const ret = this.fpIframeOverlay();
    ret.appendChild(nestedDiv);
    return ret;
  }

  open(_logger: Logger, deviceId: string, opts: ToCloudOpts) {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    document.body.appendChild(this.overlayDiv(deviceId, redirectCtx.dashboardURI));
  }
  async gatherToken(logger: Logger, opts: ToCloudOpts): Promise<string | undefined> {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    const uri = URI.from(window.location.href);
    const uriFpToken = uri.getParam(redirectCtx.tokenKey);
    if (uriFpToken) {
      localStorage.setItem(redirectCtx.tokenKey, uriFpToken);
      logger.Debug().Any({ uriFpToken }).Msg("Token set");
      window.location.href = uri.build().delParam(redirectCtx.tokenKey).toString();
    }
    return falsyToUndef(localStorage.getItem(redirectCtx.tokenKey));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async waitForToken(logger: Logger, deviceId: string): Promise<string | undefined> {
    // throw new Error("waitForToken not implemented");
    return new Promise(() => {
      /* */
    });
  }
}
