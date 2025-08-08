export * from "./react/index.js";
export * from "@fireproof/core-types-base";
export * from "@fireproof/core-base";
export * from "./iframe-strategy.js";
export * from "./redirect-strategy.js";

import { AppContext } from "@adviser/cement";

import { RedirectStrategy } from "./redirect-strategy.js";
import {
  ToCloudOptionalOpts,
  TokenStrategie,
  TokenAndClaimsEvents,
  ToCloudAttachable,
  TokenAndClaims,
} from "@fireproof/core-types-protocols-cloud";
import { WebToCloudCtx } from "./react/types.js";
import { defaultWebToCloudOpts, WebCtx } from "./react/use-attach.js";
import { toCloud as toCloudCore } from "@fireproof/core-gateways-cloud";

export type UseFpToCloudParam = Omit<Omit<Omit<ToCloudOptionalOpts, "strategy">, "context">, "events"> &
  Partial<WebToCloudCtx> & {
    readonly strategy?: TokenStrategie;
    readonly context?: AppContext;
    readonly events?: TokenAndClaimsEvents;
  };

async function defaultChanged() {
  throw new Error("not ready");
}

export function toCloud(opts: UseFpToCloudParam = {}): ToCloudAttachable {
  const mergedEvents = { ...opts.events, changed: opts.events?.changed ?? defaultChanged };
  const myOpts = {
    ...opts,
    events: mergedEvents,
    context: opts.context ?? new AppContext(),
    strategy: opts.strategy ?? new RedirectStrategy(),
    urls: opts.urls ?? {},
  };
  const webCtx = defaultWebToCloudOpts(myOpts);
  if (!opts.events) {
    // hacky but who has a better idea?
    myOpts.events.changed = async (token?: TokenAndClaims) => {
      if (token) {
        await webCtx.setToken(token);
      } else {
        // webCtx.resetToken();
      }
      if (opts.events?.changed && opts.events?.changed !== defaultChanged) {
        opts.events?.changed(token);
      }
    };
  }
  myOpts.context.set(WebCtx, webCtx);
  return toCloudCore(myOpts);
}
