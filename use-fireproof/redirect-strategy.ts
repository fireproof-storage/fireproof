import { BuildURI, Lazy, Logger, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { decodeJwt } from "jose";
import DOMPurify from "dompurify";
import { FPCloudClaim, ToCloudOpts, TokenAndClaims, TokenStrategie } from "@fireproof/core-types-protocols-cloud";
import { DashApi } from "@fireproof/core-protocols-dashboard";
import { WebToCloudCtx } from "./react/types.js";
import { WebCtx } from "./react/use-attach.js";
import { hashObjectSync } from "@fireproof/core-runtime";
import { defaultOverlayCss, defaultOverlayHtml } from "./overlay-html-defaults.js";

export interface RedirectStrategyOpts {
  readonly overlayCss: string;
  readonly overlayHtml?: (redirectLink: string) => string;
}

export class RedirectStrategy implements TokenStrategie {
  resultId?: string;
  overlayNode?: HTMLDivElement;
  waitState: "started" | "stopped" = "stopped";

  readonly overlayCss: string;
  readonly overlayHtml: (redirectLink: string) => string;

  constructor(opts: Partial<RedirectStrategyOpts> = {}) {
    this.overlayCss = opts.overlayCss ?? defaultOverlayCss();
    this.overlayHtml = opts.overlayHtml ?? defaultOverlayHtml;
  }
  readonly hash = Lazy(() =>
    hashObjectSync({
      overlayCss: this.overlayCss,
      overlayHtml: this.overlayHtml("X").toString(),
    }),
  );

  open(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts) {
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

    let overlayNode = document.body.querySelector("#fpOverlay") as HTMLDivElement;
    if (!overlayNode) {
      const styleNode = document.createElement("style");
      styleNode.innerHTML = DOMPurify.sanitize(this.overlayCss);
      document.head.appendChild(styleNode);
      overlayNode = document.createElement("div") as HTMLDivElement;
      overlayNode.id = "fpOverlay";
      overlayNode.className = "fpOverlay";
      overlayNode.innerHTML = DOMPurify.sanitize(this.overlayHtml(url.toString()));
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

  private currentToken?: TokenAndClaims;

  waiting?: ReturnType<typeof setTimeout>;

  stop() {
    if (this.waiting) {
      clearTimeout(this.waiting);
      this.waiting = undefined;
    }
    this.waitState = "stopped";
  }

  async tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined> {
    if (!this.currentToken) {
      const webCtx = opts.context.get(WebCtx) as WebToCloudCtx;
      this.currentToken = await webCtx.token();
      // console.log("RedirectStrategy tryToken - ctx", this.currentToken);
    }
    return this.currentToken;
  }

  async getTokenAndClaimsByResultId(
    logger: Logger,
    dashApi: DashApi,
    resultId: undefined | string,
    opts: ToCloudOpts,
    resolve: (value: TokenAndClaims) => void,
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
      const claims = decodeJwt(token) as FPCloudClaim;
      this.overlayNode?.style.setProperty("display", "none");
      resolve({ token, claims });
      return;
    }
    this.waiting = setTimeout(() => this.getTokenAndClaimsByResultId(logger, dashApi, resultId, opts, resolve), opts.intervalSec);
  }

  async waitForToken(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<Result<TokenAndClaims>> {
    if (!this.resultId) {
      throw new Error("waitForToken not working on redirect strategy");
    }
    const webCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    const dashApi = new DashApi(webCtx.tokenApiURI);
    this.waitState = "started";
    return new Promise<Result<TokenAndClaims>>((resolve) => {
      this.getTokenAndClaimsByResultId(logger, dashApi, this.resultId, opts, (tokenAndClaims) => {
        this.currentToken = tokenAndClaims;
        resolve(Result.Ok(tokenAndClaims));
      });
    });
  }
}
