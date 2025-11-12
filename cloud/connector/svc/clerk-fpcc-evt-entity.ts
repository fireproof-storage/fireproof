import { Lazy, Logger, poller, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { DashApi, AuthType, isResCloudDbTokenBound } from "@fireproof/core-protocols-dashboard";
import { BackendFPCC, BackendState, GetCloudDbTokenResult } from "../svc/svc-fpcc-protocol.js";
import { ensureLogger, exceptionWrapper } from "@fireproof/core-runtime";
import { TokenAndSelectedTenantAndLedger } from "@fireproof/core-types-protocols-cloud";
import { Clerk } from "@clerk/clerk-js/headless";
import { FPCCEvtApp, convertToTokenAndClaims } from "@fireproof/cloud-connector-base";

export const clerkSvc = Lazy(async (dashApi: DashApi) => {
  const clerkPubKey = await dashApi.getClerkPublishableKey({});
  // console.log("clerkSvc got publishable key", rClerkPubKey);
  const clerk = new Clerk(clerkPubKey.publishableKey);
  await clerk.load();
  clerk.addListener((session) => {
    if (session.user) {
      dashApi.logger
        .Info()
        .Any({
          user: session.user,
          windowLocation: window.location.href,
          clerkPubKey,
        })
        .Msg("Svc Clerk-User signed in");
    } else {
      dashApi.logger
        .Info()
        .Any({
          windowLocation: window.location.href,
          clerkPubKey,
        })
        .Msg("Svc Clerk-User signed out");
    }
  });

  return clerk;
});

// const clerkFPCCEvtEntities = new KeyedResolvOnce<BackendFPCC>();

export class ClerkFPCCEvtEntity implements BackendFPCC {
  // readonly appId: string;
  // readonly dbName: string;
  // readonly deviceId: string;
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly dashApi: DashApi;
  state: "needs-login" | "waiting" | "ready" = "needs-login";
  constructor(sthis: SuperThis, dashApi: DashApi/*, dbKey: DbKey, deviceId: string*/) {
    this.logger = ensureLogger(sthis, `ClerkFPCCEvtEntity`)
    // , {
    //   appId: dbKey.appId,
    //   dbName: dbKey.dbName,
    //   deviceId: deviceId,
    // });
    // this.appId = dbKey.appId;
    // this.dbName = dbKey.dbName;
    // this.deviceId = deviceId;
    this.sthis = sthis;
    this.dashApi = dashApi;
  }

  async getCloudDbToken(auth: AuthType, bkey: BackendState): Promise<Result<GetCloudDbTokenResult>> {
    const rRes = await this.dashApi.getCloudDbToken({
      auth,
      appId: bkey.appId,
      localDbName: bkey.dbName,
      deviceId: bkey.deviceId,
    });
    if (rRes.isErr()) {
      return Result.Err(rRes);
    }
    const res = rRes.Ok();
    if (!isResCloudDbTokenBound(res)) {
      return Result.Ok({ res });
    }
    const rTandC = await convertToTokenAndClaims(this.dashApi, this.logger, res.token);
    if (rTandC.isErr()) {
      return Result.Err(rTandC);
    }
    return Result.Ok({ res, claims: rTandC.Ok().claims });
  }

  isUserLoggedIn(): Promise<boolean> {
    return clerkSvc(this.dashApi).then((clerk) => {
      return !!clerk.user;
    });
  }

  async getDashApiToken(): Promise<Result<AuthType>> {
    return exceptionWrapper(async () => {
      const clerk = await clerkSvc(this.dashApi);
      if (!clerk.user) {
        return Result.Err(new Error("User not logged in"));
      }
      const token = await clerk.session?.getToken({ template: "with-email" });
      if (!token) {
        return Result.Err(new Error("No session token available"));
      }
      return Result.Ok({
        type: "clerk",
        token,
      });
    });
  }

  isFPCCEvtAppReady(): boolean {
    // need to implement a check which looks into the token if it is expired or not
    return this.state === "ready";
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

  setState(state: "needs-login" | "waiting" | "ready"): "needs-login" | "waiting" | "ready" {
    const prev = this.state;
    this.state = state;
    return prev;
  }

  //
  async waitForAuthToken(resultId: string): Promise<Result<TokenAndSelectedTenantAndLedger>> {
    return poller<TokenAndSelectedTenantAndLedger>(async () => {
      const clerk = await clerkSvc(this.dashApi);
      if (!clerk.user) {
        return {
          state: "waiting",
        };
      }
      //   console.log("clerk user is logged in:", clerk.user);

      const rWaitForToken = await this.dashApi.waitForToken({ resultId }, this.logger);
      if (rWaitForToken.isErr()) {
        return {
          state: "error",
          error: rWaitForToken.Err(),
        };
      }
      const waitedTokenByResultId = rWaitForToken.unwrap();
      if (waitedTokenByResultId.status === "found" && waitedTokenByResultId.token) {
        const token = waitedTokenByResultId.token;
        if (!token) {
          return {
            state: "error",
            error: new Error("No token received"),
          };
        }
        const rTokenClaims = await convertToTokenAndClaims(this.dashApi, this.logger, token);
        if (rTokenClaims.isErr()) {
          return {
            state: "error",
            error: rTokenClaims.Err(),
          };
        }
        return {
          state: "success",
          result: rTokenClaims.Ok(),
        };
      }
      return { state: "waiting" };
    }).then((res) => {
      switch (res.state) {
        case "success":
          return Result.Ok(res.result);
        case "error":
          return Result.Err(res.error);
        default:
          return Result.Err("should not happen");
      }
    });
  }

  // async getTokenForDb(
  //   dbInfo: DbKey,
  //   authToken: TokenAndSelectedTenantAndLedger,
  //   originEvt: Partial<FPCCMsgBase>,
  // ): Promise<FPCCEvtApp> {
  //   await sleep(50);
  //   return {
  //     ...dbInfo,
  //     tid: originEvt.tid ?? this.sthis.nextId(12).str,
  //     type: "FPCCEvtApp",
  //     src: "fp-cloud-connector",
  //     dst: originEvt.src ?? "iframe",
  //     appFavIcon: {
  //       defURL: "https://example.com/favicon.ico",
  //     },
  //     devId: this.deviceId,
  //     user: {
  //       name: "Test User",
  //       email: "test@example.com",
  //       provider: "google",
  //       iconURL: "https://example.com/icon.png",
  //     },
  //     localDb: {
  //       dbName: dbInfo.dbName,
  //       tenantId: "tenant-for-" + dbInfo.appId,
  //       ledgerId: "ledger-for-" + dbInfo.appId,
  //       accessToken: `auth-token-for-${dbInfo.appId}-${dbInfo.dbName}-with-${authToken}`,
  //     },
  //     env: {},
  //   };
  // }
}
