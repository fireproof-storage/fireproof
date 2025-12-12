import { Result, KeyedResolvOnce, WaitingForValue, Option, exception2Result } from "@adviser/cement";
import {
  ReqEnsureUser,
  ResEnsureUser,
  ReqFindUser,
  ResFindUser,
  ReqCreateTenant,
  ResCreateTenant,
  ReqUpdateTenant,
  ResUpdateTenant,
  ReqDeleteTenant,
  ResDeleteTenant,
  ReqRedeemInvite,
  ResRedeemInvite,
  ReqListTenantsByUser,
  ResListTenantsByUser,
  ReqInviteUser,
  ResInviteUser,
  ReqListInvites,
  ResListInvites,
  ReqDeleteInvite,
  ResDeleteInvite,
  ReqUpdateUserTenant,
  ResUpdateUserTenant,
  ReqCreateLedger,
  ResCreateLedger,
  ReqUpdateLedger,
  ResUpdateLedger,
  ReqDeleteLedger,
  ResDeleteLedger,
  ReqListLedgersByUser,
  ResListLedgersByUser,
  ReqCloudSessionToken,
  ResCloudSessionToken,
  ReqCertFromCsr,
  ResCertFromCsr,
  ReqExtendToken,
  ReqTokenByResultId,
  ResExtendToken,
  ResTokenByResultId,
  ReqEnsureCloudToken,
  ResEnsureCloudToken,
  DashAuthType,
} from "./msg-types.js";
import { FPApiInterface } from "./fp-api-interface.js";
import type { Clerk } from "@clerk/shared/types";

interface TypeString {
  readonly type: string;
}

interface WithType<T extends TypeString> {
  readonly type: T["type"];
}

export type WithoutTypeAndAuth<T> = Omit<T, "type" | "auth">;

export interface ClerkDashboardApiConfig<T> {
  readonly apiUrl: string;
  readonly getTokenCtx?: T;
  readonly template?: string; // if not provided default to "with-email"
  readonly gracePeriodMs?: number; // if not provided default to 5 seconds
  fetch?(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
export interface DashboardApiConfig<T> {
  readonly apiUrl: string;
  readonly getTokenCtx?: T;
  readonly gracePeriodMs: number; // if not provided default to 5 seconds
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  getToken: (ctx: never) => Promise<Result<DashAuthType>>;
}

// type NullOrUndefined<T> = T | undefined | null;

// export type ClerkCallback = (resources: { session: NullOrUndefined<{ getToken: () => Promise<string|null>  }> }) => void;
// export interface ClerkIf {
//   addListener: (callback: ClerkCallback) => () => void;
// }
// type ClerkIf = Loaded

/**
 * DashboardApi provides a client for interacting with the dashboard backend.
 *
 * @example
 * ```typescript
 * const api = new DashboardApi({
 *   apiUrl: API_URL,
 *   fetch: window.fetch.bind(window),
 *   getToken: async () => {
 *     const token = await clerkSession?.session?.getToken({ template: "with-email" });
 *     return {
 *       type: "clerk",
 *       token: token || "",
 *     };
 *   },
 * });
 * ```
 */
export class DashboardApiImpl<T> implements FPApiInterface {
  readonly cfg: DashboardApiConfig<T>;
  constructor(cfg: DashboardApiConfig<T>) {
    this.cfg = {
      ...cfg,
    };
  }

  private async request<T extends TypeString, S>(req: WithType<T>): Promise<Result<S>> {
    const rAuth = await this.cfg.getToken(this.cfg.getTokenCtx as never);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const reqBody = JSON.stringify({
      ...req,
      auth: rAuth.Ok(),
    });
    // console.log(API_URL, API_URL, reqBody);
    const res = await this.cfg.fetch(this.cfg.apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: reqBody,
    });
    if (res.ok) {
      const jso = await res.json();
      // console.log("jso", jso);
      return Result.Ok(jso as S);
    }
    const body = await res.text();
    return Result.Err(`HTTP: ${res.status} ${res.statusText}: ${body}`);
  }

  ensureUser(req: WithoutTypeAndAuth<ReqEnsureUser>): Promise<Result<ResEnsureUser>> {
    return this.request<ReqEnsureUser, ResEnsureUser>({ ...req, type: "reqEnsureUser" });
  }
  findUser(req: WithoutTypeAndAuth<ReqFindUser>): Promise<Result<ResFindUser>> {
    return this.request<ReqFindUser, ResFindUser>({ ...req, type: "reqFindUser" });
  }
  createTenant(req: WithoutTypeAndAuth<ReqCreateTenant>): Promise<Result<ResCreateTenant>> {
    return this.request<ReqCreateTenant, ResCreateTenant>({ ...req, type: "reqCreateTenant" });
  }
  updateTenant(req: WithoutTypeAndAuth<ReqUpdateTenant>): Promise<Result<ResUpdateTenant>> {
    return this.request<ReqUpdateTenant, ResUpdateTenant>({ ...req, type: "reqUpdateTenant" });
  }
  deleteTenant(req: WithoutTypeAndAuth<ReqDeleteTenant>): Promise<Result<ResDeleteTenant>> {
    return this.request<ReqDeleteTenant, ResDeleteTenant>({ ...req, type: "reqDeleteTenant" });
  }
  connectUserToTenant(req: WithoutTypeAndAuth<ReqRedeemInvite>): Promise<Result<ResRedeemInvite>> {
    return this.request<ReqRedeemInvite, ResRedeemInvite>({ ...req, type: "reqRedeemInvite" });
  }
  listTenantsByUser(req: WithoutTypeAndAuth<ReqListTenantsByUser>): Promise<Result<ResListTenantsByUser>> {
    return this.request<ReqListTenantsByUser, ResListTenantsByUser>({ ...req, type: "reqListTenantsByUser" });
  }
  inviteUser(req: WithoutTypeAndAuth<ReqInviteUser>): Promise<Result<ResInviteUser>> {
    return this.request<ReqInviteUser, ResInviteUser>({ ...req, type: "reqInviteUser" });
  }
  listInvites(req: WithoutTypeAndAuth<ReqListInvites>): Promise<Result<ResListInvites>> {
    return this.request<ReqListInvites, ResListInvites>({ ...req, type: "reqListInvites" });
  }
  deleteInvite(req: WithoutTypeAndAuth<ReqDeleteInvite>): Promise<Result<ResDeleteInvite>> {
    return this.request<ReqDeleteInvite, ResDeleteInvite>({ ...req, type: "reqDeleteInvite" });
  }
  updateUserTenant(req: WithoutTypeAndAuth<ReqUpdateUserTenant>): Promise<Result<ResUpdateUserTenant>> {
    return this.request<ReqUpdateUserTenant, ResUpdateUserTenant>({ ...req, type: "reqUpdateUserTenant" });
  }
  createLedger(req: WithoutTypeAndAuth<ReqCreateLedger>): Promise<Result<ResCreateLedger>> {
    return this.request<ReqCreateLedger, ResCreateLedger>({ ...req, type: "reqCreateLedger" });
  }
  updateLedger(req: WithoutTypeAndAuth<ReqUpdateLedger>): Promise<Result<ResUpdateLedger>> {
    return this.request<ReqUpdateLedger, ResUpdateLedger>({ ...req, type: "reqUpdateLedger" });
  }
  deleteLedger(req: WithoutTypeAndAuth<ReqDeleteLedger>): Promise<Result<ResDeleteLedger>> {
    return this.request<ReqDeleteLedger, ResDeleteLedger>({ ...req, type: "reqDeleteLedger" });
  }
  listLedgersByUser(req: WithoutTypeAndAuth<ReqListLedgersByUser>): Promise<Result<ResListLedgersByUser>> {
    return this.request<ReqListLedgersByUser, ResListLedgersByUser>({ ...req, type: "reqListLedgersByUser" });
  }
  getCloudSessionToken(req: WithoutTypeAndAuth<ReqCloudSessionToken>): Promise<Result<ResCloudSessionToken>> {
    return this.request<ReqCloudSessionToken, ResCloudSessionToken>({ ...req, type: "reqCloudSessionToken" });
  }
  getCertFromCsr(req: WithoutTypeAndAuth<ReqCertFromCsr>): Promise<Result<ResCertFromCsr>> {
    return this.request<ReqCertFromCsr, ResCertFromCsr>({ ...req, type: "reqCertFromCsr" });
  }

  redeemInvite(req: ReqRedeemInvite): Promise<Result<ResRedeemInvite>> {
    return this.request<ReqRedeemInvite, ResRedeemInvite>({ ...req, type: "reqRedeemInvite" });
  }
  getTokenByResultId(req: ReqTokenByResultId): Promise<Result<ResTokenByResultId>> {
    return this.request<ReqTokenByResultId, ResTokenByResultId>({ ...req, type: "reqTokenByResultId" });
  }
  extendToken(req: ReqExtendToken): Promise<Result<ResExtendToken>> {
    return this.request<ReqExtendToken, ResExtendToken>({ ...req, type: "reqExtendToken" });
  }

  readonly #ensureCloudToken = new KeyedResolvOnce<Result<ResEnsureCloudToken>>();
  ensureCloudToken(req: WithoutTypeAndAuth<ReqEnsureCloudToken>): Promise<Result<ResEnsureCloudToken>> {
    return this.#ensureCloudToken
      .get(
        JSON.stringify({
          appId: req.appId,
          env: req.env ?? "prod",
          tenant: req.tenant ?? undefined,
          ledger: req.ledger ?? undefined,
        }),
      )
      .once(async (my) => {
        const rRes = await this.request<ReqEnsureCloudToken, ResEnsureCloudToken>({ ...req, type: "reqEnsureCloudToken" });
        if (rRes.isErr()) {
          return Result.Err(rRes);
        }
        const res = rRes.Ok();
        const resetAfter = res.expiresInSec * 1000 - this.cfg.gracePeriodMs;
        my.self.setResetAfter(resetAfter < 0 ? 60000 : resetAfter);
        return rRes;
      });
  }
}

const keyedDashApis = new KeyedResolvOnce<DashboardApiImpl<unknown>>();
export function clerkDashApi<T>(clerk: Clerk, iopts: ClerkDashboardApiConfig<T>): DashboardApiImpl<T> {
  return keyedDashApis.get(iopts.apiUrl).once(() => {
    const waitForToken = new WaitingForValue<string>();
    const dashApi = new DashboardApiImpl({
      ...iopts,
      getTokenCtx: iopts.getTokenCtx ?? ({ template: iopts.template ?? "with-email" } as unknown as T),
      gracePeriodMs: iopts.gracePeriodMs && iopts.gracePeriodMs > 0 ? iopts.gracePeriodMs : 5000,
      getToken: () =>
        waitForToken
          .waitValue()
          .then((token) => Result.Ok<DashAuthType>({ type: "clerk", token }))
          .catch((err) => Result.Err<DashAuthType>(err)),

      fetch: iopts.fetch ?? fetch.bind(globalThis),
    });

    clerk.addListener(({ session }) => {
      const preValue = waitForToken.value();
      waitForToken.setValue(Option.None());
      // console.log("clerkDashApi: clerk session changed", session);
      if (!(session && typeof session.getToken == "function")) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      exception2Result(() => session!.getToken(dashApi.cfg.getTokenCtx as never)).then((rGetToken) => {
        if (rGetToken.isErr()) {
          waitForToken.setError(rGetToken.Err());
          waitForToken.setValue(preValue);
          return;
        }
        const token = rGetToken.Ok();
        waitForToken.setValue(Option.From(token));
      });
    });
    return dashApi;
  });
}
