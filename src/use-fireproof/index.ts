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

export function toCloud(opts: UseFpToCloudParam): rt.gw.cloud.ToCloudAttachable {
  const myOpts = {
    ...opts,
    events: opts.events ?? {
      changed: async () => {
        throw new Error("not ready");
      },
    },
    context: opts.context ?? new AppContext(),
    strategy: opts.strategy ?? new RedirectStrategy(),
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
    };
  }

  myOpts.context.set(WebCtx, webCtx);
  return rt.gw.cloud.toCloud(myOpts);
}
