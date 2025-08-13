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
import { ToCloudParam, WebCtx } from "./react/use-attach.js";
import { toCloud as toCloudCore } from "@fireproof/core-gateways-cloud";
import { defaultWebToCloudOpts } from "./cloud-ledger-token.js";

export type UseFpToCloudParam = Omit<Omit<Omit<ToCloudOptionalOpts, "strategy">, "context">, "events"> &
  Partial<WebToCloudCtx> & {
    readonly strategy?: TokenStrategie; // needs Id
    readonly context?: AppContext; // neeeds Id
    readonly events?: TokenAndClaimsEvents; // needs Id
  };

async function defaultChanged() {
  throw new Error("not ready");
}

// const toCloudOpts = new KeyedResolvOnce<UseFpToCloudParam>();

// function hashOpts(opts: UseFpToCloudParam) {
//   readonly name: string; // default "toCloud"
//   readonly intervalSec: number; // default 1 second
//   readonly tokenWaitTimeSec: number; // default 90 seconds
//   readonly refreshTokenPresetSec: number; // default 120 sec this is the time before the token expires

//     readonly base: CoerceURI;
//   readonly car: CoerceURI;
//   readonly file: CoerceURI;
//   readonly meta: CoerceURI;
// }

//     readonly urls: Partial<FPCloudRef>;
//   readonly strategy: TokenStrategie;

//   readonly context: AppContext;
//   readonly events: TokenAndClaimsEvents;
//   readonly tenant?: string; // default undefined
//   readonly ledger?: string; // default undefined

// }

export function toCloud(opts: UseFpToCloudParam = {}): ToCloudAttachable {
  console.log("use-fp toCloud", opts.name);
  const mergedEvents = { ...opts.events, changed: opts.events?.changed ?? defaultChanged };
  const myOpts = {
    ...opts,
    events: mergedEvents,
    context: opts.context,
    strategy: opts.strategy,
    urls: opts.urls,
    webCtx: {} as WebToCloudCtx,
  };
  (myOpts as { webCtx: WebToCloudCtx }).webCtx = defaultWebToCloudOpts(myOpts);
  if (!opts.events) {
    // hacky but who has a better idea?
    myOpts.events.changed = async (token?: TokenAndClaims) => {
      if (token) {
        await myOpts.webCtx.setToken(token);
      } else {
        // webCtx.resetToken();
      }
      if (opts.events?.changed && opts.events?.changed !== defaultChanged) {
        opts.events?.changed(token);
      }
    };
  }
  // myOpts.context.set(WebCtx, webCtx);
  return toCloudCore(myOpts);
}
