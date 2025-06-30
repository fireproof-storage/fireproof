import { BuildURI, Logger } from "@adviser/cement";
import { rt, ps, SuperThis } from "@fireproof/core";
import { WebCtx, WebToCloudCtx } from "@fireproof/core/react";
import { decodeJwt } from "jose";

function defaultOverlayHtml(redirectLink: string) {
  return `
    <div class="fpOverlayContent">
      <div class="fpCloseButton">&times;</div>
      Fireproof Dashboard
      Sign in to Fireproof Dashboard
      <a href="${redirectLink}" target="_blank">Redirect to Fireproof</a>
    </div>
  `;
}

const defaultOverlayCss = `
.fpContainer {
  position: relative; /* Needed for absolute positioning of the overlay */
}

.fpOverlay {
  display: none; /* Initially hidden */
  position: fixed; /* Covers the whole viewport */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent background */
  z-index: 1; /* Ensure it's on top of other content */
}

.fpOverlayContent {
  position: absolute;
  // width: calc(100vw - 50px);
  // height: calc(100vh - 50px);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); /* Center the content */
  // transform: translate(0%, 0%); /* Center the content */
  background-color: white;
  color: black;
  // margin: 10px;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
}

.fpCloseButton {
  position: absolute;
  top: 10px;
  right: 15px;
  font-size: 20px;
  cursor: pointer;
}
`;

interface RedirectStrategyOpts {
  readonly overlayCss: string;
  readonly overlayHtml?: (redirectLink: string) => string;
}

export class RedirectStrategy implements rt.gw.cloud.TokenStrategie {
  resultId?: string;
  overlayNode?: HTMLElement;
  waitState: "started" | "stopped" = "stopped";

  readonly overlayCss: string;
  readonly overlayHtml: (redirectLink: string) => string;

  constructor(opts: Partial<RedirectStrategyOpts> = {}) {
    this.overlayCss = opts.overlayCss ?? defaultOverlayCss;
    this.overlayHtml = opts.overlayHtml ?? defaultOverlayHtml;
  }

  open(sthis: SuperThis, logger: Logger, deviceId: string, opts: rt.gw.cloud.ToCloudOpts) {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    logger.Debug().Url(redirectCtx.dashboardURI).Msg("open redirect");
    this.resultId = sthis.nextId().str;
    const url = BuildURI.from(redirectCtx.dashboardURI)
      .setParam("back_url", window.location.href)
      .setParam("result_id", this.resultId)
      .setParam("local_ledger_name", deviceId);

    if (opts.ledger) {
      url.setParam("ledger", opts.ledger);
    }
    if (opts.tenant) {
      url.setParam("tenant", opts.tenant);
    }

    let overlayNode = document.body.querySelector("#fpOverlay");
    if (!overlayNode) {
      const styleNode = document.createElement("style");
      styleNode.innerHTML = this.overlayCss;
      document.head.appendChild(styleNode);
      overlayNode = document.createElement("div");
      overlayNode.id = "fpOverlay";
      overlayNode.className = "fpOverlay";
      overlayNode.innerHTML = this.overlayHtml(url.toString());
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
      url.asURL(),
      "Fireproof Login",
      `left=${left},top=${top},width=${width},height=${height},scrollbars=yes,resizable=yes,popup=yes`,
    );
    // window.location.href = url.toString();
  }

  private currentToken?: rt.gw.cloud.TokenAndClaims;

  waiting?: ReturnType<typeof setTimeout>;

  stop() {
    if (this.waiting) {
      clearTimeout(this.waiting);
      this.waiting = undefined;
    }
    this.waitState = "stopped";
  }

  async tryToken(sthis: SuperThis, logger: Logger, opts: rt.gw.cloud.ToCloudOpts): Promise<rt.gw.cloud.TokenAndClaims | undefined> {
    if (!this.currentToken) {
      const webCtx = opts.context.get(WebCtx) as WebToCloudCtx;
      this.currentToken = await webCtx.token();
      // console.log("RedirectStrategy tryToken - ctx", this.currentToken);
    }
    return this.currentToken;
  }

  async getTokenAndClaimsByResultId(
    logger: Logger,
    dashApi: ps.dashboard.Api,
    resultId: undefined | string,
    opts: rt.gw.cloud.ToCloudOpts,
    resolve: (value: rt.gw.cloud.TokenAndClaims) => void,
    attempts = 0,
  ) {
    if (!resultId) {
      return logger.Error().Msg("No resultId");
    }
    if (this.waitState !== "started") {
      return;
    }
    if (attempts * opts.intervalSec > opts.tokenWaitTimeSec) {
      logger.Error().Uint64("attempts", attempts).Msg("Token polling timed out");
      this.stop();
      return;
    }
    const rWaitForToken = await dashApi.waitForToken({ resultId }, logger);
    if (rWaitForToken.isErr()) {
      return logger.Error().Err(rWaitForToken).Msg("Error fetching token").ResultError();
    }
    const waitedTokenByResultId = rWaitForToken.unwrap();
    if (waitedTokenByResultId.status === "found" && waitedTokenByResultId.token) {
      const token = waitedTokenByResultId.token;
      const claims = decodeJwt(token) as ps.cloud.FPCloudClaim;
      this.overlayNode?.style.setProperty("display", "none");
      resolve({ token, claims });
      return;
    }
    this.waiting = setTimeout(() => this.getTokenAndClaimsByResultId(logger, dashApi, resultId, opts, resolve), opts.intervalSec);
  }

  async waitForToken(
    sthis: SuperThis,
    logger: Logger,
    deviceId: string,
    opts: rt.gw.cloud.ToCloudOpts,
  ): Promise<rt.gw.cloud.TokenAndClaims | undefined> {
    if (!this.resultId) {
      throw new Error("waitForToken not working on redirect strategy");
    }
    const webCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    const dashApi = new ps.dashboard.Api(webCtx.tokenApiURI);
    this.waitState = "started";
    return new Promise<rt.gw.cloud.TokenAndClaims | undefined>((resolve) => {
      this.getTokenAndClaimsByResultId(logger, dashApi, this.resultId, opts, (tokenAndClaims) => {
        this.currentToken = tokenAndClaims;
        resolve(tokenAndClaims);
      });
    });
  }
}
