import { Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core";
import {
  ReqCloudSessionToken,
  ReqCreateLedger,
  ReqCreateTenant,
  ReqDeleteInvite,
  ReqDeleteLedger,
  ReqDeleteTenant,
  ReqEnsureUser,
  ReqExtendToken,
  ReqFindUser,
  ReqInviteUser,
  ReqListInvites,
  ReqListLedgersByUser,
  ReqListTenantsByUser,
  ReqRedeemInvite,
  ReqTokenByResultId,
  ReqUpdateLedger,
  ReqUpdateTenant,
  ReqUpdateUserTenant,
  ReqCertFromCsr,
  ResCloudSessionToken,
  ResCreateLedger,
  ResCreateTenant,
  ResDeleteInvite,
  ResDeleteLedger,
  ResDeleteTenant,
  ResEnsureUser,
  ResExtendToken,
  ResFindUser,
  ResInviteUser,
  ResListInvites,
  ResListLedgersByUser,
  ResListTenantsByUser,
  ResRedeemInvite,
  ResTokenByResultId,
  ResUpdateLedger,
  ResUpdateTenant,
  ResUpdateUserTenant,
  ResCertFromCsr,
  FPApiParameters,
  FPApiInterface,
  ReqEnsureCloudToken,
  ResEnsureCloudToken,
  DashAuthType,
} from "@fireproof/core-protocols-dashboard";
import { DashSqlite } from "./create-handler.js";
import { FPApiSQLCtx, FPApiToken, FPTokenContext, isVerifiedUserActive, ReqWithVerifiedAuthUser } from "./types.js";
import { ensureCloudToken } from "./public/ensure-cloud-token.js";
import { findUser } from "./public/find-user.js";
import { createTenant } from "./public/create-tenant.js";
import { updateTenant } from "./public/update-tenant.js";
import { deleteTenant } from "./public/delete-tenant.js";
import { redeemInvite } from "./public/redeem-invite.js";
import { listTenantsByUser } from "./public/list-tenants-by-user.js";
import { updateUserTenant } from "./public/update-user-tenant.js";
import { inviteUser } from "./public/invite-user.js";
import { listInvites } from "./public/list-invites.js";
import { deleteInvite } from "./public/delete-invite.js";
import { createLedger } from "./public/create-ledger.js";
import { listLedgersByUser } from "./public/list-ledgers-by-user.js";
import { updateLedger } from "./public/update-ledger.js";
import { deleteLedger } from "./public/delete-ledger.js";
import { getCloudSessionToken } from "./public/get-cloud-session-token.js";
import { getTokenByResultId } from "./public/get-token-by-result-id.js";
import { getCertFromCsr } from "./public/get-cert-from-csr.js";
import { ensureUser } from "./public/ensure-user.js";
import { activeUser } from "./internal/auth.js";
import { UserNotFoundError } from "./sql/users.js";

export class FPApiSQL implements FPApiInterface {
  readonly ctx: FPApiSQLCtx;

  constructor(sthis: SuperThis, db: DashSqlite, tokenApi: Record<string, FPApiToken>, params: FPApiParameters) {
    this.ctx = {
      db: db,
      tokenApi: tokenApi,
      sthis: sthis,
      params: params,
      deviceCA: params.deviceCA,
    };
  }

  async #checkAuth<
    REQ extends {
      type: string;
      auth: DashAuthType;
    },
    RES extends { type: string },
  >(req: REQ, fn: (req: ReqWithVerifiedAuthUser<REQ>) => Promise<Result<RES>>): Promise<Result<RES>> {
    const rAuth = await activeUser(this.ctx, req);
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const auth = rAuth.Ok();
    if (!isVerifiedUserActive(auth)) {
      return Result.Err(new UserNotFoundError());
    }
    return fn({ ...req, auth });
  }

  ensureUser(req: ReqEnsureUser): Promise<Result<ResEnsureUser>> {
    return ensureUser(this.ctx, req);
  }
  findUser(req: ReqFindUser): Promise<Result<ResFindUser>> {
    return this.#checkAuth(req, (req) => findUser(this.ctx, req));
  }
  createTenant(req: ReqCreateTenant): Promise<Result<ResCreateTenant>> {
    return this.#checkAuth(req, (req) => createTenant(this.ctx, req));
  }
  updateTenant(req: ReqUpdateTenant): Promise<Result<ResUpdateTenant>> {
    return this.#checkAuth(req, (req) => updateTenant(this.ctx, req));
  }
  deleteTenant(req: ReqDeleteTenant): Promise<Result<ResDeleteTenant>> {
    return this.#checkAuth(req, (req) => deleteTenant(this.ctx, req));
  }
  redeemInvite(req: ReqRedeemInvite): Promise<Result<ResRedeemInvite>> {
    return this.#checkAuth(req, (req) => redeemInvite(this.ctx, req));
  }
  listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>> {
    return this.#checkAuth(req, (req) => listTenantsByUser(this.ctx, req));
  }
  updateUserTenant(req: ReqUpdateUserTenant): Promise<Result<ResUpdateUserTenant>> {
    return this.#checkAuth(req, (req) => updateUserTenant(this.ctx, req));
  }
  inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>> {
    return this.#checkAuth(req, (req) => inviteUser(this.ctx, req));
  }
  listInvites(req: ReqListInvites): Promise<Result<ResListInvites>> {
    return this.#checkAuth(req, (req) => listInvites(this.ctx, req));
  }
  deleteInvite(req: ReqDeleteInvite): Promise<Result<ResDeleteInvite>> {
    return this.#checkAuth(req, (req) => deleteInvite(this.ctx, req));
  }
  createLedger(req: ReqCreateLedger): Promise<Result<ResCreateLedger>> {
    return this.#checkAuth(req, (req) => createLedger(this.ctx, req));
  }
  listLedgersByUser(req: ReqListLedgersByUser): Promise<Result<ResListLedgersByUser>> {
    return this.#checkAuth(req, (req) => listLedgersByUser(this.ctx, req));
  }
  updateLedger(req: ReqUpdateLedger): Promise<Result<ResUpdateLedger>> {
    return this.#checkAuth(req, (req) => updateLedger(this.ctx, req));
  }
  deleteLedger(req: ReqDeleteLedger): Promise<Result<ResDeleteLedger>> {
    return this.#checkAuth(req, (req) => deleteLedger(this.ctx, req));
  }
  getCloudSessionToken(req: ReqCloudSessionToken, ictx: Partial<FPTokenContext> = {}): Promise<Result<ResCloudSessionToken>> {
    return this.#checkAuth(req, (req) => getCloudSessionToken(this.ctx, req, ictx));
  }
  getTokenByResultId(req: ReqTokenByResultId): Promise<Result<ResTokenByResultId>> {
    return getTokenByResultId(this.ctx, req);
  }
  getCertFromCsr(req: ReqCertFromCsr): Promise<Result<ResCertFromCsr>> {
    return this.#checkAuth(req, (req) => getCertFromCsr(this.ctx, req));
  }
  async ensureCloudToken(req: ReqEnsureCloudToken, ictx: Partial<FPTokenContext> = {}): Promise<Result<ResEnsureCloudToken>> {
    // p0.46 - For new users, ensureUser must be called first to create them
    // This allows invited users to access shared ledgers on first visit
    console.log("[ensureCloudToken p0.46] starting for appId:", req.appId);
    const rUser = await ensureUser(this.ctx, { type: "reqEnsureUser", auth: req.auth });
    if (rUser.isErr()) {
      console.log("[ensureCloudToken p0.46] ensureUser failed:", rUser.Err());
      return Result.Err(rUser.Err());
    }
    console.log("[ensureCloudToken p0.46] ensureUser succeeded, userId:", rUser.Ok().user.userId);
    return this.#checkAuth(req, (req) => ensureCloudToken(this.ctx, req, ictx));
  }

  /**
   * Extract token from request, validate it, and extend expiry by 1 day
   */
  async extendToken(req: ReqExtendToken, _ictx: Partial<FPTokenContext> = {}): Promise<Result<ResExtendToken>> {
    return Result.Err("extendToken is not supported anymore");
  }
}
