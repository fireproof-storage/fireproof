import { Result } from "@adviser/cement";
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
  ReqUpdateUserTenant,
  ResUpdateUserTenant,
  ReqInviteUser,
  ResInviteUser,
  ReqListInvites,
  ResListInvites,
  ReqDeleteInvite,
  ResDeleteInvite,
  ReqCreateLedger,
  ResCreateLedger,
  ReqListLedgersByUser,
  ResListLedgersByUser,
  ReqUpdateLedger,
  ResUpdateLedger,
  ReqDeleteLedger,
  ResDeleteLedger,
  ReqCloudSessionToken,
  ResCloudSessionToken,
  ReqTokenByResultId,
  ResTokenByResultId,
  ReqExtendToken,
  ResExtendToken,
  ReqCertFromCsr,
  ResCertFromCsr,
  ReqEnsureCloudToken,
  ResEnsureCloudToken,
} from "./msg-types.js";

export interface FPApiInterface {
  ensureUser(req: ReqEnsureUser): Promise<Result<ResEnsureUser>>;
  findUser(req: ReqFindUser): Promise<Result<ResFindUser>>;

  createTenant(req: ReqCreateTenant): Promise<Result<ResCreateTenant>>;
  updateTenant(req: ReqUpdateTenant): Promise<Result<ResUpdateTenant>>;
  deleteTenant(req: ReqDeleteTenant): Promise<Result<ResDeleteTenant>>;

  redeemInvite(req: ReqRedeemInvite): Promise<Result<ResRedeemInvite>>;

  listTenantsByUser(req: ReqListTenantsByUser): Promise<Result<ResListTenantsByUser>>;
  updateUserTenant(req: ReqUpdateUserTenant): Promise<Result<ResUpdateUserTenant>>;

  // creates / update invite
  inviteUser(req: ReqInviteUser): Promise<Result<ResInviteUser>>;
  listInvites(req: ReqListInvites): Promise<Result<ResListInvites>>;
  deleteInvite(req: ReqDeleteInvite): Promise<Result<ResDeleteInvite>>;

  createLedger(req: ReqCreateLedger): Promise<Result<ResCreateLedger>>;
  listLedgersByUser(req: ReqListLedgersByUser): Promise<Result<ResListLedgersByUser>>;
  updateLedger(req: ReqUpdateLedger): Promise<Result<ResUpdateLedger>>;
  deleteLedger(req: ReqDeleteLedger): Promise<Result<ResDeleteLedger>>;

  // listLedgersByTenant(req: ReqListLedgerByTenant): Promise<ResListLedgerByTenant>

  // attachUserToLedger(req: ReqAttachUserToLedger): Promise<ResAttachUserToLedger>
  getCloudSessionToken(req: ReqCloudSessionToken): Promise<Result<ResCloudSessionToken>>;
  getTokenByResultId(req: ReqTokenByResultId): Promise<Result<ResTokenByResultId>>;
  extendToken(req: ReqExtendToken): Promise<Result<ResExtendToken>>;
  getCertFromCsr(req: ReqCertFromCsr): Promise<Result<ResCertFromCsr>>;
  ensureCloudToken(req: ReqEnsureCloudToken): Promise<Result<ResEnsureCloudToken>>;
}
