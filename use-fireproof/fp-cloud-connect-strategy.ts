import { Future, KeyedResolvOnce, Lazy, Logger, poller, ResolveSeq } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { TokenStrategie } from "@fireproof/core-types-protocols-cloud";
import { ensureSuperThis, hashObjectSync, sleep } from "@fireproof/core-runtime";
import { RedirectStrategyOpts } from "./redirect-strategy.js";

import { FPCCProtocol, FPCCProtocolBase, isInIframe } from "@fireproof/cloud-connector-base";
import { useEffect, useState } from "react";
import { defaultFPCloudConnectorOpts, fpCloudConnector } from "../cloud/connector/svc/fp-cloud-connector.js";
import { FPCloudConnectStrategyImpl } from "./fp-cloud-connect-strategy-impl.js";
import { initializeIframe, PageFPCCProtocolOpts } from "@fireproof/cloud-connector-page";
import { FPCloudFrontend, FPCloudFrontendImpl} from "./window-open-fp-cloud.js";

export interface FPCloudConnectOpts extends RedirectStrategyOpts {
  readonly dashboardURI?: string;
  readonly cloudApiURI?: string;
  readonly fpCloudConnectURL: string;
  readonly pageController: PageControllerImpl;
  readonly title?: string;
  readonly sthis?: SuperThis;
  readonly frontend?: FPCloudFrontend;
}

// which cases exist
// stategy is called in the calling page
//   - ask my self if providing iframe services use them
//   - search for iframes and ask if ready use them
//   - if not found create an iframe and wait for it to be ready

// stategy is called in an iframe
//   - ask my self if providing iframe services use them
//   - wait for parent to provide services

interface PageControllerOpts {
  readonly window: Window;
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly frontend: FPCloudFrontend;
}

export type PageControllerImplOpts = PageFPCCProtocolOpts & Partial<PageControllerOpts>;

// const registerIframe = Lazy((callback: (iframe: HTMLIFrameElement) => void) => {
//   // Check existing iframes first
//   document.querySelectorAll("iframe").forEach((iframe) => {
//     callback(iframe as HTMLIFrameElement);
//   });

//   // Watch for new iframes
//   const observer = new MutationObserver((mutations) => {
//     mutations.forEach((mutation) => {
//       mutation.addedNodes.forEach((node) => {
//         if (node.nodeName === "IFRAME") {
//           callback(node as HTMLIFrameElement);
//         }

//         // Check if added node contains iframes
//         if (node instanceof Element) {
//           node.querySelectorAll("iframe").forEach((iframe) => {
//             callback(iframe as HTMLIFrameElement);
//           });
//         }
//       });
//     });
//   });

//   observer.observe(document.body, {
//     childList: true,
//     subtree: true,
//   });

//   return observer; // Return so you can disconnect later
// });

export class PageControllerImpl {
  mode: "myself" | "parent" | "child" | "unknown" | "timeout" = "unknown";

  readonly window: Window;
  readonly registerWaitTime: number;
  readonly protocol: FPCCProtocolBase;
  readonly sthis: SuperThis;
  readonly intervalMs: number;
  readonly iframeHref: string;
  readonly frontend: FPCloudFrontend;

  constructor(opts: PageControllerImplOpts) {
    this.window = opts.window ?? window;
    this.sthis = opts.sthis ?? ensureSuperThis();
    this.registerWaitTime = opts.registerWaitTime || 10000;
    this.intervalMs = opts.intervalMs || 150;
    this.protocol = new FPCCProtocolBase(this.sthis, opts.logger);
    this.iframeHref = opts.iframeHref;
    this.frontend = opts.frontend ?? new FPCloudFrontendImpl({
      sthis: this.sthis,
    });
  }

  hash = Lazy(() =>
    hashObjectSync({
      registerWaitTime: this.registerWaitTime,
      intervalMs: this.intervalMs,
      protocol: this.protocol.hash(),
      iframeHref: this.iframeHref,
    }),
  );

  readonly appId = Lazy(() => {
    // setup in ready
    return `we-need-to-implement-app-id-this:${this.sthis.nextId(8)}`;
  });

  readonly openloginSeq = new ResolveSeq();
  readonly ready = Lazy(async (): Promise<void> => {
    const actions: Promise<"timeout" | "parent" | "myself" | "child">[] = [
      sleep(this.registerWaitTime).then(() => "timeout" as const),
    ];
    actions.push(this.myselfWaiting().then(() => "myself" as const));
    if (isInIframe()) {
      actions.push(this.parentWaiting().then(() => "parent" as const));
    } else {
      actions.push(this.childWaiting().then(() => "child" as const));
    }

    this.protocol.onFPCCEvtNeedsLogin((msg) => {
      this.openloginSeq.add(async () => {
        // test if all dbs are ready
        console.log("FPCloudConnectStrategy detected needs login event");
        this.frontend.openFireproofLogin(msg);
        return; 
      });
      // logger.Info().Msg("FPCloudConnectStrategy detected needs login event");
    });

    return Promise.race(actions).then((mode) => {
      this.mode = mode;
    });
  });

  

  async #waitingForReady(tid: string, dst: string): Promise<void> {
    const ready = new Future<void>();
    const unreg = this.protocol.onFPCCEvtConnectorReady((msg, _srcEvent) => {
      if (msg.tid === tid) {
        return Promise.resolve();
      }
      ready.resolve();
    });

    const abCtl = new AbortController();
    return Promise.race([
      poller(
        async () => {
          this.protocol.sendMessage(
            {
              tid: tid,
              src: "parentWaiting",
              dst: "myself",
              type: "FPCCReqWaitConnectorReady",
            },
            dst,
          );
          return {
            state: "waiting",
          };
        },
        {
          intervalMs: this.intervalMs,
          abortSignal: abCtl.signal,
        },
      ).then(() => {
        /* nop */
      }),
      ready.asPromise(),
    ]).finally(() => {
      unreg();
      abCtl.abort();
    });
  }
  async parentWaiting(): Promise<void> {
    const tid = this.sthis.nextId(16).str;
    await this.#waitingForReady(tid, this.window.parent.location.href);
  }
  async childWaiting(): Promise<void> {
    const tid = this.sthis.nextId(16).str;
    const waitingIframes: Promise<void>[] = [];
    const iframes = document.querySelectorAll("iframe");
    if (iframes.length === 0) {
      const iframe = await initializeIframe(this.protocol, this.iframeHref);
      waitingIframes.push(this.#waitingForReady(tid, iframe.src));
    } else {
      iframes.forEach((iframe) => {
        waitingIframes.push(this.#waitingForReady(tid, (iframe as HTMLIFrameElement).src));
      });
    }
    return Promise.race(waitingIframes);
  }
  async myselfWaiting(): Promise<void> {
    const tid = this.sthis.nextId(16).str;
    await this.#waitingForReady(tid, this.window.location.href);
  }
}

export const PageController = Lazy((opts: PageControllerImplOpts) => {
  return new PageControllerImpl(opts);
});

// open(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): void;
// tryToken(sthis: SuperThis, logger: Logger, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
// waitForToken(sthis: SuperThis, logger: Logger, deviceId: string, opts: ToCloudOpts): Promise<TokenAndClaims | undefined>;
// stop(): void;

// const ppageProtocolInstances = new KeyedResolvOnce<PageFPCCProtocol>();

// function ppageProtocolKey(iframeSrc: string): string {
//   let iframeHref: URI;
//   if (typeof iframeSrc === "string" && iframeSrc.match(/^[./]/)) {
//     // Infer the path to in-iframe.js from the current module's location
//     // eslint-disable-next-line no-restricted-globals
//     const scriptUrl = new URL(import.meta.url);
//     // eslint-disable-next-line no-restricted-globals
//     iframeHref = URI.from(new URL(iframeSrc, scriptUrl).href);
//   } else {
//     iframeHref = URI.from(iframeSrc);
//   }
//   return iframeHref.toString();
// }

const fpCloudConnectStrategyInstances = new KeyedResolvOnce<TokenStrategie>();
// this is the frontend of fp service connector
export function FPCloudConnectStrategy(opts: Partial<FPCloudConnectOpts> = {}): TokenStrategie {
  const key = hashObjectSync(opts);
  return fpCloudConnectStrategyInstances.get(key).once(() => {
    return new FPCloudConnectStrategyImpl(opts);
  });
}


// this is the backend fp service connector
export function useFPCloudConnectSvc(): { fpSvc: FPCCProtocol; state: string } {
  const fpSvc = fpCloudConnector(
    defaultFPCloudConnectorOpts({
      loadUrlStr: window.location.href,
    }),
  );
  const [fpSvcState, setFpSvcState] = useState("initializing");
  useEffect(() => {
    console.log("useFPCloudConnect initializing token strategy");
    fpSvc.ready().then(() => {
      console.log("useFPCloudConnect token strategy ready");
      setFpSvcState("ready");
    });
  }, [fpSvc]);

  return {
    fpSvc,
    state: fpSvcState,
  };
}
