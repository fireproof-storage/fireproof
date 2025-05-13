import { BuildURI, Logger } from "@adviser/cement";
import { rt, SuperThis } from "@fireproof/core";
import { WebCtx, WebToCloudCtx } from "@fireproof/core/react";
import { TokenAndClaims } from "../runtime/gateways/cloud/to-cloud.js";

export class IframeStrategy implements rt.gw.cloud.TokenStrategie {
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
      // eslint-disable-next-line no-console
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

  stop() {
    return;
  }

  open(sthis: SuperThis, _logger: Logger, deviceId: string, opts: rt.gw.cloud.ToCloudOpts) {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    document.body.appendChild(this.overlayDiv(deviceId, redirectCtx.dashboardURI));
  }
  async tryToken(sthis: SuperThis, logger: Logger, opts: rt.gw.cloud.ToCloudOpts): Promise<TokenAndClaims | undefined> {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    // const uri = URI.from(window.location.href);
    // const uriFpToken = uri.getParam(redirectCtx.tokenParam);
    // if (uriFpToken) {
    //   await redirectCtx.setToken(uriFpToken);
    //   logger.Debug().Any({ uriFpToken }).Msg("Token set");
    //   window.location.href = uri.build().delParam(redirectCtx.tokenParam).toString();
    // }
    return redirectCtx.token();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async waitForToken(sthis: SuperThis, logger: Logger, deviceId: string): Promise<TokenAndClaims | undefined> {
    // throw new Error("waitForToken not implemented");
    return new Promise(() => {
      /* */
    });
  }
}
