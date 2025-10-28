import { ensureLogger, sleep } from "@fireproof/core-runtime";
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
  isFPCCReqWaitConnectorReady,
  FPCCProtocol,
  FPCCProtocolBase,
  dbAppKey,
  DbKey,
} from "@fireproof/cloud-connector-base";
import { SuperThis } from "@fireproof/core-types-base";
import { BuildURI, KeyedResolvSeq, Logger, Result } from "@adviser/cement";
import {
  DashApi,
  AuthType,
  ResCloudDbTokenBound,
  ResCloudDbTokenNotBound,
  isResCloudDbTokenBound,
} from "@fireproof/core-protocols-dashboard";
import { TokenAndSelectedTenantAndLedger } from "@fireproof/core-types-protocols-cloud";
import { ClerkFPCCEvtEntity, clerkSvc } from "./clerk-fpcc-evt-entity.js";

export interface IframeFPCCProtocolOpts {
  readonly dashboardURI: string;
  readonly cloudApiURI: string;
  // readonly backend: BackendFPCC;
}

export type GetCloudDbTokenResult =
  | {
      readonly res: ResCloudDbTokenBound;
      readonly claims: TokenAndSelectedTenantAndLedger["claims"];
    }
  | {
      readonly res: ResCloudDbTokenNotBound;
    };
export interface BackendFPCC {
  readonly appId: string;
  readonly dbName: string;
  readonly deviceId: string;
  isFPCCEvtAppReady(): boolean;
  getState(): "needs-login" | "waiting" | "ready";
  setState(state: "needs-login" | "waiting" | "ready"): "needs-login" | "waiting" | "ready";
  waitForAuthToken(resultId: string): Promise<Result<TokenAndSelectedTenantAndLedger>>;
  getFPCCEvtApp(): Promise<Result<FPCCEvtApp>>;
  setFPCCEvtApp(app: FPCCEvtApp): Promise<void>;
  isUserLoggedIn(): Promise<boolean>;
  getDashApiToken(): Promise<Result<AuthType>>;
  // listRegisteredDbNames(): Promise<FPCCEvtApp[]>;
  getCloudDbToken(auth: AuthType): Promise<Result<GetCloudDbTokenResult>>;
}

// function getBackendFromRegisterLocalDbName(sthis: SuperThis, dashApi: Api, req: DbKey, deviceId: string): BackendFPCC {
//   return ClerkFPCCEvtEntity.fromRegisterLocalDbName(sthis, dashApi, req, deviceId);
// }

const registeredDbs = new Map<string, BackendFPCC>();

// static fromRegisterLocalDbName(sthis: SuperThis, dashApi: Api, req: DbKey, deviceId: string): ClerkFPCCEvtEntity {
//   const key = dbAppKey(req);
//   return clerkFPCCEvtEntities.get(key).once(() => new ClerkFPCCEvtEntity(sthis, dashApi, req, deviceId));
// }

export class IframeFPCCProtocol implements FPCCProtocol {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fpccProtocol: FPCCProtocolBase;
  readonly dashboardURI: string;
  readonly dashApiURI: string;
  readonly dashApi: DashApi;

  constructor(sthis: SuperThis, opts: IframeFPCCProtocolOpts) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "IframeFPCCProtocol");
    this.fpccProtocol = new FPCCProtocolBase(sthis, this.logger);
    this.dashboardURI = opts.dashboardURI ?? "https://dev.connect.fireproof.direct/fp/cloud";
    this.dashApiURI = opts.cloudApiURI ?? "https://dev.connect.fireproof.direct/api";
    // console.log("IframeFPCCProtocol constructed with", opts);
    this.dashApi = new DashApi(this.dashApiURI);
  }

  registeredDb(key: DbKey) {
    const mapKey = dbAppKey(key);
    const existing = registeredDbs.get(mapKey);
    if (existing) {
      return existing;
    }
    const newEntity = new ClerkFPCCEvtEntity(this.sthis, this.dashApi, key, this.getDeviceId());
    registeredDbs.set(mapKey, newEntity);
    return newEntity;
  }

  readonly handleMessage = (event: MessageEvent<unknown>): void => {
    this.fpccProtocol.handleMessage(event);
  };

  getDeviceId(): string {
    return "we-need-to-implement-device-id";
  }

  async requestPageToDoLogin(backend: BackendFPCC, event: FPCCReqRegisterLocalDbName, srcEvent: MessageEvent): Promise<void> {
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

    this.sendMessage<FPCCEvtNeedsLogin>(fpccEvtNeedsLogin, srcEvent);
    backend.waitForAuthToken(loginTID).then((rAuthToken) => {
      if (rAuthToken.isErr()) {
        this.logger.Error().Err(rAuthToken).Msg("Failed to obtain auth token after login");
        return;
      }
      return backend
        .getCloudDbToken({
          type: "clerk",
          token: rAuthToken.Ok().token,
        })
        .then((rCloudToken) => {
          if (rCloudToken.isErr()) {
            throw this.logger
              .Error()
              .Err(rCloudToken)
              .Any({
                appId: backend.appId,
                dbName: backend.dbName,
              })
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
                  appId: backend.appId,
                  dbName: backend.dbName,
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
                appId: backend.appId,
                dbName: backend.dbName,
              })
              .Msg("Failed to convert DB token to token and claims after login");
          }
          const { claims, token } = rTanc.Ok();
          const fpccEvtApp = {
            tid: event.tid,
            dst: event.src,
            type: "FPCCEvtApp",
            appId: backend.appId,
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
              dbName: backend.dbName,
              tenantId: claims.selected.tenant,
              ledgerId: claims.selected.ledger,
              accessToken: token,
            },
            env: {}, // future env vars
          } satisfies FPCCSendMessage<FPCCEvtApp>;
          backend.setState("ready");
          backend.setFPCCEvtApp(this.sendMessage<FPCCEvtApp>(fpccEvtApp, srcEvent));
          // this.logger.Info().Any(fpccEvtApp).Msg("Successfully obtained token for DB after login");
        });
    });
  }

  readonly stateSeq = new KeyedResolvSeq();
  runStateMachine(backend: BackendFPCC, event: FPCCMessage, srcEvent: MessageEvent<unknown>): Promise<void> {
    return this.stateSeq.get(dbAppKey(backend)).add(() => this.atomicRunStateMachine(backend, event, srcEvent));
  }

  listRegisteredDbs(): BackendFPCC[] {
    return Array.from(registeredDbs.values());
  }

  async atomicRunStateMachine(backend: BackendFPCC, event: FPCCMessage, srcEvent: MessageEvent<unknown>): Promise<void> {
    const bstate = backend.getState();
    switch (true) {
      case bstate === "ready" && isFPCCReqRegisterLocalDbName(event):
        console.log("Backend is ready, sending FPCCEvtApp");
        return backend
          .getFPCCEvtApp()
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
          console.log("Backend is waiting");
          // this.logger.Info().Str("appID", event.appID).Msg("Backend is waiting");
          throw new Error("Backend is in waiting state; not implemented yet.");
        }
        break;
      case bstate === "needs-login" && isFPCCReqRegisterLocalDbName(event):
        {
          console.log("Backend needs login", backend.appId, backend.dbName);
          const rAuthToken = await backend.getDashApiToken();
          if (rAuthToken.isErr()) {
            console.log("User not logged in, requesting login", backend.appId, backend.dbName);
            // make all dbs go to waiting state
            backend.setState("waiting");
            return this.requestPageToDoLogin(backend, event, srcEvent);
          } else {
            // const backend = this.registeredDb(event);

            if (backend.isFPCCEvtAppReady()) {
              const rFpccEvtApp = await backend.getFPCCEvtApp();
              console.log("Backend is ready, sending FPCCEvtApp", backend.appId, backend.dbName, rFpccEvtApp);
              if (rFpccEvtApp.isOk()) {
                this.sendMessage<FPCCEvtApp>(rFpccEvtApp.Ok(), srcEvent);
                return;
              }
            } else {
              const rDbToken = await this.dashApi.getCloudDbToken({
                auth: rAuthToken.Ok(),
                appId: backend.appId,
                localDbName: backend.dbName,
                deviceId: backend.deviceId,
              });
              if (rDbToken.isErr()) {
                console.log("Failed to obtain DB token, requesting login", backend.appId, backend.dbName, rDbToken);
                // make all dbs go to waiting state
                backend.setState("waiting");
                await sleep(60000);
                this.stateSeq.get(dbAppKey(backend)).add(() => this.atomicRunStateMachine(backend, event, srcEvent));
                return;
              }
              if (rDbToken.Ok().status === "not-bound") {
                console.log("DB is not bound, requesting login", backend.appId, backend.dbName);
                // make all dbs go to waiting state
                backend.setState("waiting");
                return this.requestPageToDoLogin(backend, event, srcEvent);
              } else {
                const rCloudToken = await backend.getCloudDbToken(rAuthToken.Ok());
                if (rCloudToken.isErr()) {
                  this.logger.Warn().Err(rCloudToken).Msg("Failed to obtain DB token, re-running state machine after delay");
                  await sleep(1000);
                  this.stateSeq.get(dbAppKey(backend)).add(() => this.atomicRunStateMachine(backend, event, srcEvent));
                  return;
                }
                const res = rCloudToken.Ok().res;
                if (!isResCloudDbTokenBound(res)) {
                  return this.requestPageToDoLogin(backend, event, srcEvent);
                }
                const rTandC = await convertToTokenAndClaims(this.dashApi, this.logger, res.token);
                if (rTandC.isErr()) {
                  this.logger
                    .Warn()
                    .Err(rTandC)
                    .Msg("Failed to convert DB token to token and claims, re-running state machine after delay");
                  await sleep(1000);
                  this.stateSeq.get(dbAppKey(backend)).add(() => this.atomicRunStateMachine(backend, event, srcEvent));
                  return;
                }
                const { token, claims } = rTandC.Ok();
                const fpccEvtApp: FPCCEvtApp = {
                  tid: event.tid,
                  type: "FPCCEvtApp",
                  src: "iframe",
                  dst: event.src,
                  appId: backend.appId,
                  appFavIcon: {
                    defURL: "https://fireproof.direct/favicon.ico",
                  },
                  devId: backend.deviceId,
                  user: {
                    name: claims.nickname ?? claims.userId,
                    email: claims.email,
                    provider: claims.provider ?? "unknown",
                    iconURL: "https://fireproof.direct/favicon.ico",
                  },
                  localDb: {
                    dbName: backend.dbName,
                    tenantId: claims.selected.tenant,
                    ledgerId: claims.selected.ledger,
                    accessToken: token,
                  },
                  env: {},
                };
                await backend.setFPCCEvtApp(fpccEvtApp);
                backend.setState("ready");
                console.log("Sent FPCCEvtApp after obtaining DB token", backend.appId, backend.dbName);
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

  readonly handleFPCCMessage = (event: FPCCMessage, srcEvent: MessageEvent<unknown>): boolean | undefined => {
    try {
      switch (true) {
        case isFPCCReqRegisterLocalDbName(event): {
          this.logger.Info().Any(event).Msg("Iframe-Received request to register app");
          const backend = this.registeredDb(event);
          backend.setState("needs-login");
          console.log("Running state machine for register local db name", backend.getState());
          this.runStateMachine(backend, event, srcEvent);
          break;
        }

        case isFPCCReqWaitConnectorReady(event): {
          this.logger.Info().Str("appID", event.appId).Msg("Received request to wait for connector ready");
          // Here you would implement logic to handle the wait for connector ready request
          const readyEvent: FPCCSendMessage<FPCCEvtConnectorReady> = {
            type: "FPCCEvtConnectorReady",
            timestamp: Date.now(),
            seq: event.seq,
            devId: this.getDeviceId(),
            dst: event.src,
          };
          this.sendMessage<FPCCEvtConnectorReady>(readyEvent, srcEvent);
          break;
        }
      }
    } catch (error) {
      this.logger.Error().Err(error).Msg("Error handling FPCC message");
    }
    return undefined;
  };

  readonly handleError = (_error: unknown): void => {
    throw new Error("Method not implemented.");
  };

  stop(): void {
    console.log("IframeFPCCProtocol stop called");
    this.fpccProtocol.stop();
  }

  injectSend(sendFn: (evt: FPCCMessage, srcEvent: MessageEvent<unknown>) => FPCCMessage): void {
    this.fpccProtocol.injectSend(sendFn);
  }

  async ready(): Promise<FPCCProtocol> {
    await clerkSvc(this.dashApi);
    await this.fpccProtocol.ready();
    this.fpccProtocol.onFPCCMessage(this.handleFPCCMessage);
    return this;
  }

  sendMessage<T extends FPCCMsgBase>(message: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown>): T {
    // message.src = window.location.href;
    // console.log("IframeFPCCProtocol sendMessage called", message);
    return this.fpccProtocol.sendMessage(message, srcEvent);
  }
}
