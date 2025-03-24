import { FPContext, rt } from "@fireproof/core";
import { defaultWebToCloudOpts, WebCtx, WebToCloudCtx } from "@fireproof/core/react";

export * from "@fireproof/core/react";
export * from "@fireproof/core";
export * from "./iframe-strategy.js";
export * from "./redirect-strategy.js";

import { RedirectStrategy } from "./redirect-strategy.js";

export function toCloud(
  opts: Omit<rt.gw.cloud.ToCloudOptionalOpts, "strategy"> &
    Partial<WebToCloudCtx> & { readonly strategy?: rt.gw.cloud.TokenStrategie },
): rt.gw.cloud.ToCloudAttachable {
  return rt.gw.cloud.toCloud({
    ...opts,
    context: opts.context ?? new FPContext().set(WebCtx, defaultWebToCloudOpts(opts)),
    strategy: opts.strategy ?? new RedirectStrategy(),
  });
}
