import { exception2Result, Result } from "@adviser/cement";
import {
  DashAuthType,
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
} from "./msg-types.js";
import { FPApiInterface } from "./fp-api-interface.js";
import { Falsy } from "@fireproof/core-types-base";

interface TypeString {
  readonly type: string;
}

interface WithType<T extends TypeString> {
  readonly type: T["type"];
}

export type WithoutTypeAndAuth<T> = Omit<T, "type" | "auth">;

export interface DashboardApiConfig {
  readonly apiUrl: string;
  getToken(): Promise<DashAuthType | Falsy>;
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

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
export class DashboardApi implements FPApiInterface {
  private readonly cfg: DashboardApiConfig;
  constructor(cfg: DashboardApiConfig) {
    this.cfg = cfg;
  }

  private async getAuth() {
    return exception2Result(() => {
      return this.cfg.getToken().then((token) => {
        if (!token) throw new Error("No token available");
        return token as DashAuthType;
      });
    });
  }

  private async request<T extends TypeString, S>(req: WithType<T>): Promise<Result<S>> {
    const rAuth = await this.getAuth();
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

  ensureCloudToken(req: WithoutTypeAndAuth<ReqEnsureCloudToken>): Promise<Result<ResEnsureCloudToken>> {
    return this.request<ReqEnsureCloudToken, ResEnsureCloudToken>({ ...req, type: "reqEnsureCloudToken" });
  }
}
