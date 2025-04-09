import { FPContext, rt } from "@fireproof/core";
import { defaultWebToCloudOpts, RedirectStrategy, WebCtx, WebToCloudCtx } from "@fireproof/core/react";

export * from "@fireproof/core/react";
export * from "@fireproof/core";

export function toCloud(
  opts: Omit<rt.gw.cloud.ToCloudOptionalOpts, "strategy"> &
    Partial<WebToCloudCtx> & { readonly strategy?: rt.gw.cloud.UITokenStrategie },
): rt.gw.cloud.ToCloudAttachable {
  return rt.gw.cloud.toCloud({
    ...opts,
    context: opts.context ?? new FPContext().set(WebCtx, defaultWebToCloudOpts(opts)),
    strategy: opts.strategy ?? new RedirectStrategy(),
  });
}
