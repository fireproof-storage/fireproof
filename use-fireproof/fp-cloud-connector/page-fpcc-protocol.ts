import { ensureLogger, sleep } from "@fireproof/core-runtime";
import { FPCCProtocol, FPCCProtocolBase } from "./fpcc-protocol.js";
import { SuperThis } from "@fireproof/core-types-base";
import { Future, KeyedResolvOnce, Logger, ResolveOnce } from "@adviser/cement";
import {
  FPCCEvtApp,
  FPCCEvtNeedsLogin,
  FPCCMessage,
  FPCCMsgBase,
  FPCCReqRegisterLocalDbName,
  FPCCReqWaitConnectorReady,
  FPCCSendMessage,
  isFPCCEvtApp,
  isFPCCEvtConnectorReady,
  isFPCCEvtNeedsLogin,
} from "./protocol-fp-cloud-conn.js";

import { dbAppKey } from "./iframe-fpcc-protocol.js";

export interface PageFPCCProtocolOpts {
  readonly maxConnectRetries?: number;
  readonly iframeHref: string;
  readonly loginWaitTime?: number;
}

interface WaitForFPCCEvtApp {
  readonly register: FPCCReqRegisterLocalDbName;
  readonly fpccEvtApp: FPCCEvtApp;
}

export class PageFPCCProtocol implements FPCCProtocol {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fpccProtocol: FPCCProtocolBase;
  readonly maxConnectRetries: number;
  readonly dst: string;

  // readonly futureConnected = new Future<void>();
  readonly onFPCCEvtNeedsLoginFns = new Set<(msg: FPCCEvtNeedsLogin) => void>();
  readonly onFPCCEvtAppFns = new Set<(msg: FPCCEvtApp) => void>();
  readonly registerFPCCEvtApp = new KeyedResolvOnce<WaitForFPCCEvtApp>();
  readonly waitforFPCCEvtAppFutures = new Map<string, Future<FPCCEvtApp>>();
  waitForConnection?: ReturnType<typeof setInterval>;
  readonly loginWaitTime: number;
  readonly starter = new ResolveOnce<void>();

  constructor(sthis: SuperThis, iopts: PageFPCCProtocolOpts) {
    const opts = {
      maxConnectRetries: 20,
      loginWaitTime: 30000,
      ...iopts,
    } as Required<PageFPCCProtocolOpts>;
    this.sthis = sthis;
    this.dst = opts.iframeHref.toString();
    this.logger = ensureLogger(sthis, "PageFPCCProtocol", {
      iFrameHref: this.dst,
    });
    this.fpccProtocol = new FPCCProtocolBase(sthis, this.logger);
    this.maxConnectRetries = opts.maxConnectRetries;
    this.loginWaitTime = opts.loginWaitTime;
  }

  stop(): void {
    this.fpccProtocol.stop();
    this.onFPCCEvtAppFns.clear();
    this.onFPCCEvtNeedsLoginFns.clear();
    this.waitforFPCCEvtAppFutures.clear();
    this.registerFPCCEvtApp.reset();
    this.starter.reset();
    if (this.waitForConnection) {
      clearInterval(this.waitForConnection);
      this.waitForConnection = undefined;
    }
  }

  readonly handleMessage = (_event: MessageEvent<unknown>): void => {
    this.fpccProtocol.handleMessage(_event);
  };

  onFPCCMessage(callback: (msg: FPCCMessage) => boolean | undefined): void {
    this.fpccProtocol.onFPCCMessage(callback);
  }

  getAppId(): string {
    // setup in ready
    return "we-need-to-implement-app-id-this";
  }

  readonly handleError = (_error: unknown): void => {
    throw new Error("Method not implemented.");
  };

  // readonly onceConnected = Lazy((error?: Error) => {
  //   if (error) {
  //     this.logger.Error().Err(error).Msg("Failed to connect FPCCProtocol");
  //     this.futureConnected.reject(error);
  //     return;
  //   }
  //   this.futureConnected.resolve();
  // });

  async registerDatabase(dbName: string, ireg: Partial<FPCCReqRegisterLocalDbName> = {}): Promise<FPCCEvtApp> {
    return this.ready()
      .then(() => {
        const reg = {
          ...ireg,
          tid: ireg.tid,
          type: "FPCCReqRegisterLocalDbName",
          appId: ireg.appId ?? this.getAppId(),
          appURL: ireg.appURL ?? window.location.href,
          dbName,
          dst: ireg.dst ?? this.dst,
        } satisfies FPCCSendMessage<FPCCReqRegisterLocalDbName>;
        const key = dbAppKey(reg);
        return this.registerFPCCEvtApp.get(key).once(async () => {
          if (this.waitforFPCCEvtAppFutures.has(key)) {
            throw this.logger
              .Error()
              .Any({
                key: dbAppKey(reg),
              })
              .Msg("multiple waitforFPCCEvtAppFuture in flight")
              .AsError();
          }
          const fpccEvtAppFuture = new Future<FPCCEvtApp>();
          this.waitforFPCCEvtAppFutures.set(key, fpccEvtAppFuture);
          this.sendMessage<FPCCReqRegisterLocalDbName>(reg);
          return {
            register: reg,
            fpccEvtApp: await Promise.race([
              fpccEvtAppFuture.asPromise(),
              sleep(this.loginWaitTime).then(() => {
                throw this.logger
                  .Error()
                  .Any({
                    loginWaitTime: this.loginWaitTime,
                    key: dbAppKey(reg),
                  })
                  .Msg("timeout waiting for FPCCEvtApp")
                  .AsError();
              }),
            ]),
          };
        });
      })
      .then(({ fpccEvtApp }) => fpccEvtApp);
  }

  injectSend(send: (evt: FPCCMessage, srcEvent: MessageEvent<unknown>) => FPCCMessage): void {
    this.fpccProtocol.injectSend(send);
  }

  ready(): Promise<PageFPCCProtocol> {
    return this.starter
      .once(async () => {
        await this.fpccProtocol.ready();
        let maxTries = 0;
        const appId = this.getAppId();
        this.waitForConnection = setInterval(() => {
          if (maxTries > this.maxConnectRetries) {
            this.logger.Error().Msg("FPCC iframe connection timeout.");
            clearInterval(this.waitForConnection);
            this.waitForConnection = undefined;
            return;
          }
          if (maxTries && maxTries % ~~(this.maxConnectRetries / 2) === 0) {
            this.logger.Warn().Int("tried", maxTries).Msg("Waiting for FPCC iframe connector to be ready...");
          }
          this.sendMessage<FPCCReqWaitConnectorReady>({
            src: window.location.href,
            type: "FPCCReqWaitConnectorReady",
            dst: "iframe",
            seq: maxTries++,
            timestamp: Date.now(),
            appId,
          });
        }, 100);
        const waitForConnectorReady = new Future<void>();

        this.onFPCCMessage((msg: FPCCMessage): boolean | undefined => {
          // console.log("PageFPCCProtocol received message", msg);
          switch (true) {
            case isFPCCEvtNeedsLogin(msg): {
              this.logger.Info().Any(msg).Msg("Received needs login event from FPCC iframe");
              this.onFPCCEvtNeedsLoginFns.forEach((cb) => cb(msg));
              break;
            }
            case isFPCCEvtApp(msg): {
              const key = dbAppKey({
                appId: msg.appId,
                dbName: msg.localDb.dbName,
              });
              const future = this.waitforFPCCEvtAppFutures.get(key);
              // console.log("PAGE-Received FPCCEvtApp for key", key, msg, future);
              if (future) {
                future.resolve(msg);
                this.waitforFPCCEvtAppFutures.delete(key);
              }
              this.onFPCCEvtAppFns.forEach((cb) => cb(msg));
              break;
            }

            case isFPCCEvtConnectorReady(msg): {
              clearInterval(this.waitForConnection);
              this.waitForConnection = undefined;
              waitForConnectorReady.resolve();
              return true;
            }
          }
          return undefined;
        });
        return waitForConnectorReady.asPromise();
      })
      .then(() => this);
  }

  onFPCCEvtNeedsLogin(callback: (msg: FPCCEvtNeedsLogin) => void): void {
    this.onFPCCEvtNeedsLoginFns.add(callback);
  }

  onFPCCEvtApp(callback: (msg: FPCCEvtApp) => void): void {
    this.onFPCCEvtAppFns.add(callback);
  }

  sendMessage<T extends FPCCMsgBase>(msg: FPCCSendMessage<T>, srcEvent = new MessageEvent("sendMessage")): T {
    return this.fpccProtocol.sendMessage(msg, srcEvent);
  }
}
