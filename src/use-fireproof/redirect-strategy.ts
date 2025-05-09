import { BuildURI, Logger } from "@adviser/cement";
import { rt, ps, SuperThis } from "@fireproof/core";
import { WebCtx, WebToCloudCtx } from "@fireproof/core/react";
import { decodeJwt } from "jose";

function overlayHtml(redirectLink: string) {
  return `
    <div class="fpOverlayContent">
      <div class="fpCloseButton">&times;</div>
      <a href="${redirectLink}" target="_blank">Redirect to Fireproof</a>
    </div>
`;
}

const overlayCss = `
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
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); /* Center the content */
  background-color: white;
  color: black;
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

export class RedirectStrategy implements rt.gw.cloud.TokenStrategie {
  resultId?: string;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      styleNode.innerHTML = overlayCss;
      document.head.appendChild(styleNode);
      overlayNode = document.createElement("div");
      overlayNode.id = "fpOverlay";
      overlayNode.className = "fpOverlay";
      overlayNode.innerHTML = overlayHtml(url.toString());
      document.body.appendChild(overlayNode);
      overlayNode.querySelector(".fpCloseButton")?.addEventListener("click", () => {
        if (overlayNode) {
          overlayNode.style.display = overlayNode.style.display === "block" ? "none" : "block";
        }
      });
    }
    overlayNode.style.display = "block";
    // window.location.href = url.toString();
  }

  currentToken?: rt.gw.cloud.TokenAndClaims;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async tryToken(sthis: SuperThis, logger: Logger, opts: rt.gw.cloud.ToCloudOpts): Promise<rt.gw.cloud.TokenAndClaims | undefined> {
    return this.currentToken;

    // const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    // const uri = URI.from(window.location.href);
    // const uriFpToken = uri.getParam(redirectCtx.tokenParam);
    // if (uriFpToken) {
    //   await redirectCtx.setToken(uriFpToken);
    //   logger.Debug().Any({ uriFpToken }).Msg("Token set");
    //   window.location.href = uri.build().delParam(redirectCtx.tokenParam).toString();
    // }
    // return redirectCtx.token();
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
    const resultId = this.resultId;
    const dashApi = new ps.dashboard.Api(webCtx.tokenApiURI);
    async function getTokenAndClaimsByResultId(resolve: (value: rt.gw.cloud.TokenAndClaims) => void) {
      const rWaitForToken = await dashApi.waitForToken({ resultId }, logger);
      if (rWaitForToken.isErr()) {
        return logger.Error().Err(rWaitForToken).Msg("Error fetching token").ResultError();
      }
      const waitedTokenByResultId = rWaitForToken.unwrap();
      if (waitedTokenByResultId.status === "found" && waitedTokenByResultId.token) {
        const token = waitedTokenByResultId.token;
        const claims = decodeJwt(token) as ps.cloud.FPCloudClaim;
        resolve({ token, claims });
        return;
      }
      setTimeout(getTokenAndClaimsByResultId, opts.interval);
    }
    return new Promise<rt.gw.cloud.TokenAndClaims | undefined>((resolve) => {
      getTokenAndClaimsByResultId((tokenAndClaims) => {
        this.currentToken = tokenAndClaims;
        resolve(tokenAndClaims);
      });
    });
  }
}
