import { BuildURI, Logger, URI } from "@adviser/cement";
import { rt, sleep } from "@fireproof/core";
import { WebCtx, WebToCloudCtx } from "@fireproof/core/react";

export class RedirectStrategy implements rt.gw.cloud.TokenStrategie {
  open(logger: Logger, deviceId: string, opts: rt.gw.cloud.ToCloudOpts) {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    logger.Debug().Url(redirectCtx.dashboardURI).Msg("open redirect");
    const url = BuildURI.from(redirectCtx.dashboardURI)
      .setParam("back_url", window.location.href)
      .setParam("local_ledger_name", deviceId)
      .toString();
    window.location.href = url;
  }

  async gatherToken(logger: Logger, opts: rt.gw.cloud.ToCloudOpts): Promise<string | undefined> {
    const redirectCtx = opts.context.get(WebCtx) as WebToCloudCtx;
    const uri = URI.from(window.location.href);
    const uriFpToken = uri.getParam(redirectCtx.tokenKey);
    if (uriFpToken) {
      redirectCtx.setToken(uriFpToken);
      logger.Debug().Any({ uriFpToken }).Msg("Token set");
      window.location.href = uri.build().delParam(redirectCtx.tokenKey).toString();
    }
    return redirectCtx.token();
  }

  async waitForToken(logger: Logger): Promise<string | undefined> {
    logger.Warn().Msg("waitForToken should not be called -- using redirect strategy");
    await sleep(100000);
    throw new Error("waitForToken not working on redirect strategy");
  }
}
