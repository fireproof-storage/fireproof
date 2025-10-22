import { ensureLogger, sleep } from "@fireproof/core-runtime";
import { FPCCProtocol, FPCCProtocolBase } from "./fpcc-protocol.js";
import {
  FPCCEvtApp,
  FPCCEvtConnectorReady,
  FPCCEvtNeedsLogin,
  FPCCMessage,
  FPCCMsgBase,
  FPCCReqRegisterLocalDbName,
  FPCCSendMessage,
  isFPCCReqRegisterLocalDbName,
  isFPCCReqWaitConnectorReady,
} from "./protocol-fp-cloud-conn.js";
import { SuperThis } from "@fireproof/core-types-base";
import { BuildURI, KeyedResolvOnce, Logger, Result } from "@adviser/cement";

interface IframeFPCCProtocolOpts {
  dashboardURI: string;
  waitForTokenURI: string;
  backend: BackendFPCC;
}

export interface DbKey {
  readonly appId: string;
  readonly dbName: string;
}

export function dbAppKey(o: DbKey): string {
  return o.appId + ":" + o.dbName;
}

interface BackendFPCC {
  getState(): "needs-login" | "waiting" | "ready";
  setState(state: "needs-login" | "waiting" | "ready"): "needs-login" | "waiting" | "ready";
  waitForAuthToken(tid: string, tokenURI: string): Promise<string>;
  getFPCCEvtApp(): Promise<Result<FPCCEvtApp>>;
  setFPCCEvtApp(app: FPCCEvtApp): Promise<void>;
  listRegisteredDbNames(): Promise<FPCCEvtApp[]>;
  getTokenForDb(dbInfo: DbKey, authToken: string, src: Partial<FPCCMsgBase>): Promise<FPCCEvtApp>;
}

function getBackendFromRegisterLocalDbName(sthis: SuperThis, req: DbKey, deviceId: string): BackendFPCC {
  return MemoryFPCCEvtEntity.fromRegisterLocalDbName(sthis, req, deviceId);
}

const memoryFPCCEvtEntities = new KeyedResolvOnce<BackendFPCC>();
class MemoryFPCCEvtEntity implements BackendFPCC {
  static fromRegisterLocalDbName(sthis: SuperThis, req: DbKey, deviceId: string): MemoryFPCCEvtEntity {
    const key = dbAppKey(req);
    return memoryFPCCEvtEntities.get(key).once(() => new MemoryFPCCEvtEntity(sthis, req, deviceId));
  }
  readonly dbKey: DbKey;
  readonly deviceId: string;
  readonly sthis: SuperThis;
  state: "needs-login" | "waiting" | "ready" = "needs-login";
  constructor(sthis: SuperThis, dbKey: DbKey, deviceId: string) {
    this.dbKey = dbKey;
    this.deviceId = deviceId;
    this.sthis = sthis;
  }

  fpccEvtApp?: FPCCEvtApp;
  getFPCCEvtApp(): Promise<Result<FPCCEvtApp>> {
    return Promise.resolve(this.fpccEvtApp ? Result.Ok(this.fpccEvtApp) : Result.Err(new Error("No FPCCEvtApp registered")));
  }

  setFPCCEvtApp(app: FPCCEvtApp): Promise<void> {
    this.fpccEvtApp = app;
    return Promise.resolve();
  }
  getState(): "needs-login" | "waiting" | "ready" {
    // For testing purposes, we always return "needs-login"
    return this.state;
  }

  listRegisteredDbNames(): Promise<FPCCEvtApp[]> {
    return Promise.all(
      memoryFPCCEvtEntities
        .values()
        .map((key) => {
          return key.value;
        })
        .filter((v) => v.isOk())
        .map((v) => v.Ok().getFPCCEvtApp()),
    ).then((apps) => {
      console.log("listRegisteredDbNames-o", apps);
      return apps.filter((res) => res.isOk()).map((res) => res.Ok());
    });
  }

  setState(state: "needs-login" | "waiting" | "ready"): "needs-login" | "waiting" | "ready" {
    const prev = this.state;
    this.state = state;
    return prev;
  }

  waitForAuthToken(tid: string, tokenURI: string): Promise<string> {
    return sleep(100).then(() => `fake-auth-token:${tid}:${tokenURI}`);
  }

  async getTokenForDb(dbInfo: DbKey, authToken: string, originEvt: Partial<FPCCMsgBase>): Promise<FPCCEvtApp> {
    await sleep(50);
    return {
      ...dbInfo,
      tid: originEvt.tid ?? this.sthis.nextId(12).str,
      type: "FPCCEvtApp",
      src: "fp-cloud-connector",
      dst: originEvt.src ?? "iframe",
      appFavIcon: {
        defURL: "https://example.com/favicon.ico",
      },
      devId: this.deviceId,
      user: {
        name: "Test User",
        email: "test@example.com",
        provider: "google",
        iconURL: "https://example.com/icon.png",
      },
      localDb: {
        dbName: dbInfo.dbName,
        tenantId: "tenant-for-" + dbInfo.appId,
        ledgerId: "ledger-for-" + dbInfo.appId,
        accessToken: `auth-token-for-${dbInfo.appId}-${dbInfo.dbName}-with-${authToken}`,
      },
      env: {},
    };
  }
}

export class IframeFPCCProtocol implements FPCCProtocol {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fpccProtocol: FPCCProtocolBase;
  readonly dashboardURI: string;
  readonly waitForTokenURI: string;

  constructor(sthis: SuperThis, opts: Partial<IframeFPCCProtocolOpts> = {}) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "IframeFPCCProtocol");
    this.fpccProtocol = new FPCCProtocolBase(sthis, this.logger);
    this.dashboardURI = opts.dashboardURI ?? "https://dev.connect.fireproof.direct/fp/cloud";
    this.waitForTokenURI = opts.waitForTokenURI ?? "https://dev.connect.fireproof.direct/api";
  }

  readonly handleMessage = (event: MessageEvent<unknown>): void => {
    this.fpccProtocol.handleMessage(event);
  };

  getDeviceId(): string {
    return "we-need-to-implement-device-id";
  }

  async needsLogin(backend: BackendFPCC, event: FPCCReqRegisterLocalDbName, srcEvent: MessageEvent): Promise<void> {
    const loginTID = this.sthis.nextId(16).str;
    const url = BuildURI.from(this.dashboardURI)
      .setParam("back_url", "close")
      .setParam("result_id", loginTID)
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
      loadDbNames: [
        ...(await backend.listRegisteredDbNames().then((apps) =>
          apps.map((app) => ({
            appId: app.appId,
            dbName: app.localDb.dbName,
          })),
        )),
        event,
      ],
      reason: "BindCloud",
    };
    for (const dbInfo of fpccEvtNeedsLogin.loadDbNames) {
      const backend = getBackendFromRegisterLocalDbName(this.sthis, dbInfo, this.getDeviceId());
      backend.setState("waiting");
    }
    this.sendMessage<FPCCEvtNeedsLogin>(fpccEvtNeedsLogin, srcEvent);
    backend.waitForAuthToken(loginTID, this.waitForTokenURI).then((authToken) => {
      return Promise.allSettled(
        fpccEvtNeedsLogin.loadDbNames.map(async (dbInfo) => backend.getTokenForDb(dbInfo, authToken, event)),
      ).then((results) => {
        results.forEach((res) => {
          if (res.status === "fulfilled") {
            const fpccEvtApp = res.value;
            backend.setFPCCEvtApp(fpccEvtApp);
            this.sendMessage<FPCCEvtApp>(fpccEvtApp, srcEvent);
            backend.setState("ready");
            // this.logger.Info().Any(fpccEvtApp).Msg("Successfully obtained token for DB after login");
          } else {
            this.logger.Error().Err(res.reason).Msg("Failed to obtain token for DB after login");
          }
        });
      });
    });
  }

  runStateMachine(backend: BackendFPCC, event: FPCCMessage, srcEvent: MessageEvent<unknown>): Promise<void> {
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
        console.log("Backend needs login");
        return this.needsLogin(backend, event, srcEvent);

      default:
        throw this.logger.Error().Str("state", bstate).Msg("Unknown backend state").AsError();
    }
  }

  readonly handleFPCCMessage = (event: FPCCMessage, srcEvent: MessageEvent<unknown>): boolean | undefined => {
    try {
      switch (true) {
        case isFPCCReqRegisterLocalDbName(event): {
          this.logger.Info().Any(event).Msg("Iframe-Received request to register app");
          const backend = getBackendFromRegisterLocalDbName(this.sthis, event, this.getDeviceId());
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
    await this.fpccProtocol.ready();
    this.fpccProtocol.onFPCCMessage(this.handleFPCCMessage);
    return this;
  }

  sendMessage<T extends FPCCMsgBase>(message: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown>): void {
    // message.src = window.location.href;
    // console.log("IframeFPCCProtocol sendMessage called", message);
    this.fpccProtocol.sendMessage(message, srcEvent);
  }
}
