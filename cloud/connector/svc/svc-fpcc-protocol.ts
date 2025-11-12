import { ensureLogger, hashObjectSync } from "@fireproof/core-runtime";
import {
  convertToTokenAndClaims,
  FPCCEvtApp,
  FPCCEvtConnectorReady,
  FPCCEvtNeedsLogin,
  FPCCMessage,
  FPCCMsgBase,
  FPCCReqRegisterLocalDbName,
  FPCCSendMessage,
  isFPCCReqRegisterLocalDbName,
  FPCCProtocol,
  FPCCProtocolBase,
  dbAppKey,
  Ready,
} from "@fireproof/cloud-connector-base";
import { SuperThis } from "@fireproof/core-types-base";
import { BuildURI, Keyed, KeyedResolvOnce, KeyedResolvSeq, Lazy, Logger, Result, sleep } from "@adviser/cement";
import {
  DashApi,
  AuthType,
  ResCloudDbTokenBound,
  ResCloudDbTokenNotBound,
  isResCloudDbTokenBound,
} from "@fireproof/core-protocols-dashboard";
import { TokenAndSelectedTenantAndLedger } from "@fireproof/core-types-protocols-cloud";
import { ClerkFPCCEvtEntity, clerkSvc } from "./clerk-fpcc-evt-entity.js";

export interface SvcFPCCProtocolOpts {
  readonly dashboardURI: string;
  readonly cloudApiURI: string;
  readonly sthis?: SuperThis;
  readonly backend?: BackendFPCC;
}

export type GetCloudDbTokenResult =
  | {
      readonly res: ResCloudDbTokenBound;
      readonly claims: TokenAndSelectedTenantAndLedger["claims"];
    }
  | {
      readonly res: ResCloudDbTokenNotBound;
    };

export interface BackendKey {
  readonly appURL: string;
  readonly  appId: string;
  readonly  dbName: string;
  readonly  ledger?: string | undefined;
 readonly   tenant?: string | undefined;
}

export type BackendStates = "needs-login" | "waiting" | "ready";
export interface BackendState extends BackendKey {
  getState(): BackendStates;
  setState(state: BackendStates): BackendStates;
  reset(): void;
}


export interface BackendFPCC {
  // readonly appId: string;
  // readonly dbName: string;
  // readonly deviceId: string;
  isFPCCEvtAppReady(): boolean;
  waitForAuthToken(resultId: string): Promise<Result<TokenAndSelectedTenantAndLedger>>;
  getFPCCEvtApp(): Promise<Result<FPCCEvtApp>>;
  setFPCCEvtApp(app: FPCCEvtApp): Promise<void>;
  isUserLoggedIn(): Promise<boolean>;
  getDashApiToken(): Promise<Result<AuthType>>;
  // listRegisteredDbNames(): Promise<FPCCEvtApp[]>;
  getCloudDbToken(auth: AuthType, bkey: BackendKey): Promise<Result<GetCloudDbTokenResult>>;
}


// function getBackendFromRegisterLocalDbName(sthis: SuperThis, dashApi: Api, req: DbKey, deviceId: string): BackendFPCC {
//   return ClerkFPCCEvtEntity.fromRegisterLocalDbName(sthis, dashApi, req, deviceId);
// }

// const registeredDbs = new Map<string, BackendFPCC>();

// static fromRegisterLocalDbName(sthis: SuperThis, dashApi: Api, req: DbKey, deviceId: string): ClerkFPCCEvtEntity {
//   const key = dbAppKey(req);
//   return clerkFPCCEvtEntities.get(key).once(() => new ClerkFPCCEvtEntity(sthis, dashApi, req, deviceId));
// }

const backendPerDashUri = new KeyedResolvOnce<BackendFPCC>();

const backendStatePerDb = new Keyed<BackendState, BackendKey>(({key}: { key: BackendKey}) => {
  let state: BackendStates = "needs-login";
  const hash = hashObjectSync({
    appURL: key.appURL,
    appId: key.appId,
    dbName: key.dbName,
    ledger: key.ledger,
    tenant: key.tenant,
  });
  return {
    ...key,
    getState: () => state,
    setState: (newState: BackendStates) => { state = newState; return state },
    key: hash,
    reset: () => {
      throw new Error("Not implemented yet");
    }
  }
}, {
})

export class SvcFPCCProtocol implements FPCCProtocol {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fpccProtocol: FPCCProtocolBase;
  readonly dashboardURI: string;
  readonly dashApiURI: string;
  readonly dashApi: DashApi;
  readonly hash: () => string;
  readonly backendFPCC: BackendFPCC;

  constructor(sthis: SuperThis, opts: SvcFPCCProtocolOpts) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "SvcFPCCProtocol");
    this.fpccProtocol = new FPCCProtocolBase(sthis, this.logger);
    this.hash = Lazy(() => hashObjectSync(opts));
    this.dashboardURI = opts.dashboardURI ?? "https://dev.connect.fireproof.direct/fp/cloud";
    this.dashApiURI = opts.cloudApiURI ?? "https://dev.connect.fireproof.direct/api";
    // console.log("IframeFPCCProtocol constructed with", opts);
    this.dashApi = new DashApi(this.sthis, this.dashApiURI);
    this.backendFPCC = opts.backend ?? backendPerDashUri.get(this.dashboardURI).once(() => {
      return new ClerkFPCCEvtEntity(this.sthis, this.dashApi);
    })
  }

  // readonly activeIframes = new KeyedResolvOnce<Result<HTMLIFrameElement>>();
  // serveIframe(iframe: HTMLIFrameElement): Promise<Result<HTMLIFrameElement>> {
  //   return this.ready().then(() => {
  //     return this.activeIframes.get(iframe.src).once(async () => {
  //       let seq = 0;

  //       const tid = this.sthis.nextId(16).str;
  //       const gotReady = new Future<void>();

  //       this.fpccProtocol.onFPCCEvtConnectorReady((msg) => {
  //         if (msg.tid !== tid) {
  //           return;
  //         }
  //         gotReady.resolve();
  //         this.logger.Info().Any(msg).Msg("Svc-Received connector ready event from iframe");
  //       });
  //       const abc = new AbortController();
  //       const result = await Promise.race([
  //         poller(
  //           () => {
  //             this.fpccProtocol.sendMessage<FPCCEvtConnectorReady>(
  //               {
  //                 tid,
  //                 type: "FPCCEvtConnectorReady",
  //                 timestamp: Date.now(),
  //                 seq: seq++,
  //                 devId: "svc-device-id",
  //                 dst: `iframe:${iframe.src}`,
  //               },
  //               iframe.src,
  //             );
  //             return Promise.resolve({ state: "waiting" });
  //           },
  //           {
  //             intervalMs: 100,
  //             exponentialBackoff: true,
  //             timeoutMs: 10000,
  //             abortSignal: abc.signal,
  //           },
  //         ).then(() => Promise.resolve(Result.Err("Timeout waiting for iframe to be ready"))),
  //         gotReady.asPromise().then(() => Result.Ok(abc.abort())),
  //       ]);
  //       if (result.isErr()) {
  //         return this.logger.Warn().Err(result).Msg("Failed to serve iframe").ResultError();
  //       }
  //       return Result.Ok(iframe);
  //     });
  //   });
  // }

  // buildBackendKey(key: DbKey): BackendState {
  //   return {
  //     ...key,
  //     deviceId: this.getDeviceId(),
  //   }
  //   // const mapKey = dbAppKey(key);
  //   // const existing = registeredDbs.get(mapKey);
  //   // if (existing) {
  //   //   return existing;
  //   // }
  //   // const newEntity = new ClerkFPCCEvtEntity(this.sthis, this.dashApi, key, this.getDeviceId());
  //   // registeredDbs.set(mapKey, newEntity);
  //   // return newEntity;
  // }

  getDeviceId(): string {
    return "we-need-to-implement-device-id";
  }

  async requestPageToDoLogin(bkey: BackendKey, event: FPCCReqRegisterLocalDbName, srcEvent: MessageEvent): Promise<void> {
    const loginTID = this.sthis.nextId(16).str;
    const url = BuildURI.from(this.dashboardURI)
      .setParam("back_url", "wait-for-token") // dummy back_url since we don't return to the app here
      .setParam("result_id", loginTID)
      .setParam("app_id", event.appId)
      .setParam("local_ledger_name", event.dbName);
    if (event.ledger) {
      url.setParam("ledger", event.ledger);
    }
    if (event.tenant) {
      url.setParam("tenant", event.tenant);
    }
    const fpccEvtNeedsLogin: FPCCSendMessage<FPCCEvtNeedsLogin> = {
      tid: event.tid,
      type: "FPCCEvtNeedsLogin",
      dst: event.src,
      devId: this.getDeviceId(),
      loginURL: url.toString(),
      loginTID,
      loadDbNames: [event],
      reason: "BindCloud",
    };

    this.fpccProtocol.sendMessage<FPCCEvtNeedsLogin>(fpccEvtNeedsLogin, srcEvent);
    this.backendFPCC.waitForAuthToken(loginTID).then((rAuthToken) => {
      if (rAuthToken.isErr()) {
        this.logger.Error().Err(rAuthToken).Msg("Failed to obtain auth token after login");
        return;
      }
      const bstate = backendStatePerDb.get(event).once(() => {
        let state: BackendStates= "needs-login";
        return {
          appId: event.appId,
          dbName: event.dbName,
          deviceId: this.getDeviceId(),
          getState: () => state,
          setState: (newState: BackendStates) => {
            state = newState;
          }
        }
      });
      return this.backendFPCC
        .getCloudDbToken({
          type: "clerk",
          token: rAuthToken.Ok().token,
        }, bstate)
        .then((rCloudToken) => {
          if (rCloudToken.isErr()) {
            throw this.logger
              .Error()
              .Err(rCloudToken)
              .Any({...bstate})
              .Msg("Failed to obtain DB token after login")
              .AsError();
          }
          const cloudToken = rCloudToken.Ok();
          switch (cloudToken.res.status) {
            case "not-bound":
              throw this.logger
                .Error()
                .Str("status", cloudToken.res.status)
                .Any({
                  ...bstate
                })
                .Msg("DB is still not bound after login")
                .AsError();
          }
          return cloudToken.res.token;
        })
        .then((cloudToken) => convertToTokenAndClaims(this.dashApi, this.logger, cloudToken))
        .then((rTanc) => {
          if (rTanc.isErr()) {
            throw this.logger
              .Error()
              .Err(rTanc)
              .Any({
                ...bstate
              })
              .Msg("Failed to convert DB token to token and claims after login");
          }
          const { claims, token } = rTanc.Ok();
          const fpccEvtApp = {
            tid: event.tid,
            dst: event.src,
            type: "FPCCEvtApp",
            appId: bstate.appId,
            appFavIcon: {
              defURL: "https://fireproof.direct/favicon.ico",
            },
            devId: "",
            user: {
              name: claims.nickname ?? claims.userId,
              email: claims.email,
              provider: claims.provider ?? "unknown",
              iconURL: "https://fireproof.direct/favicon.ico",
            },
            localDb: {
              dbName: bstate.dbName,
              tenantId: claims.selected.tenant,
              ledgerId: claims.selected.ledger,
              accessToken: token,
            },
            env: {}, // future env vars
          } satisfies FPCCSendMessage<FPCCEvtApp>;
          bstate.setState("ready");
          this.backendFPCC.setFPCCEvtApp(this.fpccProtocol.sendMessage<FPCCEvtApp>(fpccEvtApp, srcEvent));
          // this.logger.Info().Any(fpccEvtApp).Msg("Successfully obtained token for DB after login");
        });
    });
  }

  readonly stateSeq = new KeyedResolvSeq();
  runStateMachine(event: FPCCReqRegisterLocalDbName, srcEvent: MessageEvent<unknown>): Promise<void> {
    // const bkey: BackendKey = {
    //   appId: event.appId,
    //   dbName: event.localDb.dbName,
    //   deviceId: this.getDeviceId(),
    // };
    const key = dbAppKey(event);
    return this.stateSeq.get(key).add(() => backendStatePerDb.get(key).this.atomicRunStateMachine(event, event, srcEvent));
  }

  listRegisteredDbs(): BackendKey[] {
    return Array.from(backendStatePerDb.values()).filter((bstate) => bstate.value.Ok().getState() === "ready").map((state) => {
      const bstate = state.value.Ok();
      return {
        appId: bstate.appId,
        dbName: bstate.dbName,
        deviceId: bstate.deviceId,
      };
    })
  }

  async atomicRunStateMachine(state: BackendState, event: FPCCMessage, srcEvent: MessageEvent<unknown>): Promise<void> {
    const bstate = state.getState();
    switch (true) {
      case bstate === "ready" && isFPCCReqRegisterLocalDbName(event):
        this.logger.Debug().Msg("Backend is ready, sending FPCCEvtApp");
        return this.backendFPCC.getFPCCEvtApp()
          .then((rFpccEvtApp) => {
            if (rFpccEvtApp.isOk()) {
              this.sendMessage<FPCCEvtApp>(rFpccEvtApp.Ok(), srcEvent);
            } else {
              this.logger.Error().Err(rFpccEvtApp).Msg("Failed to get FPCCEvtApp in ready state");
            }
          })
          .then(() => Promise.resolve());
      case bstate === "waiting":
        {
          this.logger.Debug().Msg("Backend is waiting");
          // this.logger.Info().Str("appID", event.appID).Msg("Backend is waiting");
          throw new Error("Backend is in waiting state; not implemented yet.");
        }
        break;
      case bstate === "needs-login" && isFPCCReqRegisterLocalDbName(event):
        {
          this.logger.Debug().Msg("Backend needs login", state.appId, state.dbName);
          const rAuthToken = await this.backendFPCC.getDashApiToken();
          if (rAuthToken.isErr()) {
            this.logger
              .Warn()
              .Err(rAuthToken)
              .Any({ appId: state.appId, dbName: state.dbName })
              .Msg("User not logged in, requesting login");
            // make all dbs go to waiting state
            state.setState("waiting");
            return this.requestPageToDoLogin(state, event, srcEvent);
          } else {
            // const backend = this.registeredDb(event);

            if (this.backendFPCC.isFPCCEvtAppReady()) {
              const rFpccEvtApp = await this.backendFPCC.getFPCCEvtApp();
              if (rFpccEvtApp.isErr()) {
                this.logger
                  .Warn()
                  .Err(rFpccEvtApp)
                  .Any({ appId: state.appId, dbName: state.dbName })
                  .Msg("Backend reports error");
              }
              if (rFpccEvtApp.isOk()) {
                this.logger
                  .Debug()
                  .Any({ appId: state.appId, dbName: state.dbName, fpccEvtApp: rFpccEvtApp.Ok() })
                  .Msg("Sending existing FPCCEvtApp");
                this.sendMessage<FPCCEvtApp>(rFpccEvtApp.Ok(), srcEvent);
                return;
              }
            } else {
              const rDbToken = await this.dashApi.getCloudDbToken({
                auth: rAuthToken.Ok(),
                appId: state.appId,
                localDbName: state.dbName,
                deviceId: state.deviceId,
              });
              if (rDbToken.isErr()) {
                this.logger
                  .Error()
                  .Err(rDbToken)
                  .Any({ appId: state.appId, dbName: state.dbName })
                  .Msg("Unexpected error obtaining DB token");
                state.setState("waiting");
                await sleep(60000);
                this.stateSeq.get(dbAppKey(state)).add(() => this.atomicRunStateMachine(state, event, srcEvent));
                return;
              }
              if (rDbToken.Ok().status === "not-bound") {
                this.logger.Debug().Any({ appId: state.appId, dbName: state.dbName }).Msg("DB is not bound, requesting login");
                // make all dbs go to waiting state
                state.setState("waiting");
                return this.requestPageToDoLogin(state, event, srcEvent);
              } else {
                const rCloudToken = await this.backendFPCC.getCloudDbToken(rAuthToken.Ok(), state);
                if (rCloudToken.isErr()) {
                  this.logger.Warn().Err(rCloudToken).Msg("Failed to obtain DB token, re-running state machine after delay");
                  await sleep(1000);
                  this.stateSeq.get(dbAppKey(state)).add(() => this.atomicRunStateMachine(state, event, srcEvent));
                  return;
                }
                const res = rCloudToken.Ok().res;
                if (!isResCloudDbTokenBound(res)) {
                  return this.requestPageToDoLogin(state, event, srcEvent);
                }
                const rTandC = await convertToTokenAndClaims(this.dashApi, this.logger, res.token);
                if (rTandC.isErr()) {
                  this.logger
                    .Warn()
                    .Err(rTandC)
                    .Msg("Failed to convert DB token to token and claims, re-running state machine after delay");
                  await sleep(1000);
                  this.stateSeq.get(dbAppKey(state)).add(() => this.atomicRunStateMachine(state, event, srcEvent));
                  return;
                }
                const { token, claims } = rTandC.Ok();
                const fpccEvtApp: FPCCEvtApp = {
                  tid: event.tid,
                  type: "FPCCEvtApp",
                  src: "iframe",
                  dst: event.src,
                  appId: state.appId,
                  appFavIcon: {
                    defURL: "https://fireproof.direct/favicon.ico",
                  },
                  devId: state.deviceId,
                  user: {
                    name: claims.nickname ?? claims.userId,
                    email: claims.email,
                    provider: claims.provider ?? "unknown",
                    iconURL: "https://fireproof.direct/favicon.ico",
                  },
                  localDb: {
                    dbName: state.dbName,
                    tenantId: claims.selected.tenant,
                    ledgerId: claims.selected.ledger,
                    accessToken: token,
                  },
                  env: {},
                };
                await this.backendFPCC.setFPCCEvtApp(fpccEvtApp);
                state.setState("ready");
                this.logger
                  .Debug()
                  .Any({ appId: state.appId, dbName: state.dbName })
                  .Msg("Sent FPCCEvtApp after obtaining DB token");
                this.sendMessage<FPCCEvtApp>(fpccEvtApp, srcEvent);
                return;
              }
            }
          }
        }
        break;

      default:
        throw this.logger.Error().Str("state", bstate).Msg("Unknown backend state").AsError();
    }
  }

  readonly handleError = (_error: unknown): void => {
    throw new Error("Method not implemented.");
  };

  readonly handleMessage = (event: MessageEvent<unknown>): void => {
    this.fpccProtocol.handleMessage(event);
  }

  stop(): void {
    this.logger.Debug().Msg("SvcFPCCProtocol stop called");
    this.fpccProtocol.stop();
  }

  injectSend(sendFn: (evt: FPCCMessage, srcEvent: MessageEvent<unknown> | string) => FPCCMessage): void {
    this.fpccProtocol.injectSend(sendFn);
  }

  readonly ready = Lazy(async (): Promise<Result<Ready>> => {
    await clerkSvc(this.dashApi);
    await this.fpccProtocol.ready();

    this.fpccProtocol.onFPCCReqWaitConnectorReady(async (event, srcEvent: MessageEvent<unknown>) => {
          this.logger.Info().Str("appID", event.appId).Msg("Received request to wait for connector ready");
          // Here you would implement logic to handle the wait for connector ready request
          const readyEvent: FPCCSendMessage<FPCCEvtConnectorReady> = {
            tid: event.tid,
            type: "FPCCEvtConnectorReady",
            timestamp: Date.now(),
            seq: event.seq,
            devId: this.getDeviceId(),
            dst: event.src,
          };
          this.sendMessage<FPCCEvtConnectorReady>(readyEvent, srcEvent);
    })

    this.fpccProtocol.onFPCCReqRegisterLocalDbName(async (event, srcEvent: MessageEvent<unknown>) => {
        return this.runStateMachine(event, srcEvent);
    });

    return Result.Ok({ 
      type: "ready"
    });
  });

  sendMessage<T extends FPCCMsgBase>(message: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown> | string): T {
    // message.src = window.location.href;
    // console.log("IframeFPCCProtocol sendMessage called", message);
    return this.fpccProtocol.sendMessage(message, srcEvent);
  }
}
