import { ensureLogger, ensureSuperThis, hashObjectSync } from "@fireproof/core-runtime";
import { SuperThis } from "@fireproof/core-types-base";
import { Future, KeyedResolvOnce, Lazy, Logger, poller, ResolveOnce, Result, timeouted } from "@adviser/cement";
import {
  FPCCProtocol,
  FPCCProtocolBase,
  FPCCEvtApp,
  FPCCMessage,
  FPCCMsgBase,
  FPCCReqRegisterLocalDbName,
  FPCCReqWaitConnectorReady,
  FPCCSendMessage,
  dbAppKey,
  FPCCEvtNeedsLogin,
  Ready,
  isPeerReady,
} from "@fireproof/cloud-connector-base";
import { initializeIframe } from "./page-handler.js";

export interface FPCloudFrontend {
  hash(): string;
  openLogin(msg: FPCCEvtNeedsLogin): void;
  stop(): void;
}

export interface ResultActivePeerTimeout {
  readonly state: "timeout";
}

export interface ResultActivePeerConnected {
  readonly state: "connected";
  readonly peer: string; // url
}

export interface ResultActivePeerError {
  readonly state: "error";
  readonly error: Error;
}

export type ResultActivePeer = ResultActivePeerTimeout | ResultActivePeerConnected | ResultActivePeerError;

export interface ConnectorReadyTimeouts {
  readonly localMs: number; // 300,
  readonly remoteMs: number; //1000,
}
export interface PageFPCCProtocolOpts {
  readonly iframeHref: string;
  readonly fpCloudFrontend: FPCloudFrontend;
  readonly loginWaitTime?: number;
  readonly registerWaitTime?: number;
  readonly intervalMs?: number;
  readonly sthis?: SuperThis;
  readonly maxConnectRetries?: number;
  readonly connectorReadyTimeouts?: Partial<ConnectorReadyTimeouts>;
}

interface WaitForFPCCEvtApp {
  readonly register: FPCCReqRegisterLocalDbName;
  readonly fpccEvtApp: FPCCEvtApp;
}

class PageFPCCProtocol implements FPCCProtocol {
  // readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fpccProtocol: FPCCProtocolBase;
  readonly maxConnectRetries: number;
  readonly iFrameHref: string;

  // readonly futureConnected = new Future<void>();
  readonly registerFPCCEvtApp = new KeyedResolvOnce<WaitForFPCCEvtApp>();
  // readonly waitforFPCCEvtAppFutures = new Map<string, Future<FPCCEvtApp>>();
  readonly loginWaitTime: number;
  readonly registerWaitTime: number;
  readonly starter = new ResolveOnce<void>();
  readonly sthis: SuperThis;

  readonly connectorReadyTimeouts: ConnectorReadyTimeouts;
  readonly fpCloudFrontend: FPCloudFrontend;

  readonly hash = Lazy((val?: string) => val || ""); // setup in constructor

  constructor(opts: Required<PageFPCCProtocolOpts> & { hash: string }) {
    this.sthis = opts.sthis;
    this.iFrameHref = opts.iframeHref;
    this.logger = ensureLogger(opts.sthis, "PageFPCCProtocol", {
      iFrameHref: this.iFrameHref,
    });
    this.fpccProtocol = new FPCCProtocolBase(opts.sthis, this.logger);
    this.maxConnectRetries = opts.maxConnectRetries;
    this.loginWaitTime = opts.loginWaitTime;
    this.fpCloudFrontend = opts.fpCloudFrontend;
    this.registerWaitTime = opts.registerWaitTime;
    this.connectorReadyTimeouts = {
      localMs: 300,
      remoteMs: 1000,
      ...opts.connectorReadyTimeouts,
    };
    this.hash(opts.hash);
  }

  stop(): void {
    this.fpccProtocol.stop();
    // this.waitforFPCCEvtAppFutures.clear();
    this.registerFPCCEvtApp.reset();
    this.starter.reset();
  }

  getAppId(): string {
    // setup in ready
    return "we-need-to-implement-app-id-this";
  }

  readonly handleError = (_error: unknown): void => {
    throw new Error("Method not implemented.");
  };

  async registerDatabase(dbName: string, ireg: Partial<FPCCReqRegisterLocalDbName> = {}): Promise<Result<FPCCEvtApp>> {
    return this.ready().then((peer) => {
      if (!isPeerReady(peer)) {
        return Result.Err<FPCCEvtApp>(new Error("FPCC Protocol not ready - cannot register database"));
      }
      const sreg = {
        ...ireg,
        type: "FPCCReqRegisterLocalDbName",
        appId: ireg.appId ?? this.getAppId(),
        appURL: ireg.appURL ?? window.location.href,
        dbName,
        dst: ireg.dst ?? peer.peer,
      } satisfies FPCCSendMessage<FPCCReqRegisterLocalDbName>;
      const key = dbAppKey(sreg);
      return this.registerFPCCEvtApp
        .get(key)
        .once(async () => {
          const tid = this.sthis.nextId(12).str;
          const fpccEvtAppFuture = new Future<FPCCEvtApp>();
          this.fpccProtocol.onFPCCEvtApp((evt, _srcEvent) => {
            if (evt.tid === tid) {
              fpccEvtAppFuture.resolve(evt);
            }
          });
          const reg = this.sendMessage<FPCCReqRegisterLocalDbName>(
            {
              ...sreg,
              tid,
              src: `page-${window.location.href}-${this.hash()}-${key}`,
              dst: peer.peer,
            },
            peer.peer,
          );
          const rTimeoutFPCCEvtApp = await timeouted(
            fpccEvtAppFuture
              .asPromise()
              .then((evt) => Result.Ok(evt))
              .catch((error) => Result.Err<FPCCEvtApp>(error)),
            {
              timeout: this.registerWaitTime,
            },
          );
          if (rTimeoutFPCCEvtApp.state !== "success") {
            throw new Error(`Timeout waiting for FPCCEvtApp for db "${dbName}"`);
          }
          const rFPCCEvtApp = rTimeoutFPCCEvtApp.value;
          if (rFPCCEvtApp.isErr()) {
            throw Result.Err<WaitForFPCCEvtApp>(rFPCCEvtApp);
          }
          return Result.Ok({
            register: reg,
            fpccEvtApp: rFPCCEvtApp.unwrap(),
          } satisfies WaitForFPCCEvtApp);
        })
        .then((rWaitForFPCCEvtApp) => {
          if (rWaitForFPCCEvtApp.isErr()) {
            return Result.Err(rWaitForFPCCEvtApp);
          }
          return Result.Ok(rWaitForFPCCEvtApp.unwrap().fpccEvtApp);
        });
    });
  }

  injectSend(send: (evt: FPCCMessage, srcEvent: MessageEvent<unknown> | string) => FPCCMessage): void {
    this.fpccProtocol.injectSend(send);
  }

  sendMessage<T extends FPCCMsgBase>(event: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown> | string): T {
    return this.fpccProtocol.sendMessage(event, srcEvent);
  }

  async tryRegisterApp(dst: string, waitTimeMs: number): Promise<ResultActivePeer> {
    const tid = this.sthis.nextId(12).str;
    let seq = 0;
    const isReady = new Future<void>();
    this.fpccProtocol.onFPCCEvtConnectorReady((msg: FPCCMessage) => {
      if (msg.tid !== tid) {
        return;
      }
      isReady.resolve();
    });

    const abortController = new AbortController();
    const polling = poller(
      async () => {
        this.sendMessage<FPCCReqWaitConnectorReady>(
          {
            type: "FPCCReqWaitConnectorReady",
            tid,
            src: `page-${window.location.href}-${this.hash()}`,
            dst,
            appId: this.getAppId(),
            timestamp: Date.now(),
            seq: seq++,
          },
          dst,
        );
        return {
          state: "waiting",
          abortSignal: abortController.signal,
        };
      },
      {
        timeoutMs: waitTimeMs,
        intervalMs: ~~(waitTimeMs / 5) + 1,
      },
    );
    return Promise.race([
      polling.then((res) => {
        if (res.state === "error") {
          return {
            state: "error" as const,
            error: res.error,
          };
        }
        return {
          state: "timeout" as const,
        };
      }),
      isReady.asPromise().then(() => {
        abortController.abort();
        return {
          state: "connected" as const,
          peer: dst,
        };
      }),
    ]);
  }

  readonly ready = Lazy(async (): Promise<Result<Ready>> => {
    return this.starter.once(async () => {
      const rReady = await this.fpccProtocol.ready();
      if (rReady.isErr()) {
        return Result.Err(rReady);
      }
      window.addEventListener("message", this.fpccProtocol.handleMessage);
      // try my self
      const tryRegisterApps: Promise<ResultActivePeer>[] = [
        this.tryRegisterApp(window.location.href, this.connectorReadyTimeouts.localMs),
      ];
      if (window.parent !== window) {
        tryRegisterApps.push(
          this.tryRegisterApp(window.parent.location.href, this.connectorReadyTimeouts.remoteMs).then((res) => {
            switch (res.state) {
              case "connected":
                return res;
              case "error":
                return res;
              case "timeout": {
                return initializeIframe(this.fpccProtocol, this.iFrameHref).then((iframe) =>
                  this.tryRegisterApp(iframe.src, this.connectorReadyTimeouts.remoteMs),
                );
              }
            }
          }),
        );
      } else {
        const dstUrl = await initializeIframe(this.fpccProtocol, this.iFrameHref);
        tryRegisterApps.push(this.tryRegisterApp(dstUrl.src, this.connectorReadyTimeouts.remoteMs));
      }
      const result = await Promise.race(tryRegisterApps);
      if (result.state === "error") {
        return Result.Err(result.error);
      }
      if (result.state === "timeout") {
        return Result.Err("Could not connect to FPCC Svc - timeout");
      }

      this.fpccProtocol.onFPCCEvtNeedsLogin((msg) => {
        // this could be called multiple times - let the frontend handle it
        this.fpCloudFrontend.openLogin(msg);
        // we might start polling for connection here
      });
      return Result.Ok({
        type: "peer" as const,
        peer: result.peer,
      });
    });
  });
}

const keyedPageFPCCProtocols = new KeyedResolvOnce<PageFPCCProtocol>();
export const pageFPCCProtocol = Lazy((iopts: PageFPCCProtocolOpts) => {
  const opts = {
    maxConnectRetries: 20,
    loginWaitTime: 30000,
    ...iopts,
    connectorReadyTimeouts: {
      localMs: iopts.connectorReadyTimeouts?.localMs ?? 300,
      remoteMs: iopts.connectorReadyTimeouts?.remoteMs ?? 1000,
    },
    sthis: iopts.sthis ?? ensureSuperThis(),
  } as Required<PageFPCCProtocolOpts>;
  const hash = hashObjectSync({
    ...opts, // need some more love
    fpCloudFrontendHash: opts.fpCloudFrontend.hash(),
  });
  return keyedPageFPCCProtocols.get(hash).once(() => new PageFPCCProtocol({ ...opts, hash }));
});
