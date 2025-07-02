export * from "@fireproof/core/react";
export * from "@fireproof/core";
export * from "./iframe-strategy.js";
export * from "./redirect-strategy.js";

import { rt } from "@fireproof/core";
import { defaultWebToCloudOpts, WebCtx, WebToCloudCtx } from "@fireproof/core/react";
import { AppContext } from "@adviser/cement";

import { RedirectStrategy } from "./redirect-strategy.js";

export type UseFpToCloudParam = Omit<Omit<Omit<rt.gw.cloud.ToCloudOptionalOpts, "strategy">, "context">, "events"> &
  Partial<WebToCloudCtx> & {
    readonly strategy?: rt.gw.cloud.TokenStrategie;
    readonly context?: AppContext;
    readonly events?: rt.gw.cloud.TokenAndClaimsEvents;
  };

async function defaultChanged() {
  throw new Error("not ready");
}

export function toCloud(opts: UseFpToCloudParam = {}): rt.gw.cloud.ToCloudAttachable {
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
    myOpts.events.changed = async (token?: rt.gw.cloud.TokenAndClaims) => {
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
  return rt.gw.cloud.toCloud(myOpts);
}
