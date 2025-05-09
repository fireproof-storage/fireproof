import {
  ReqDeleteTenant,
  ReqUpdateTenant,
  ReqCreateTenant,
  ReqDeleteInvite,
  ReqListInvites,
  ReqInviteUser,
  ReqFindUser,
  ReqRedeemInvite,
  ReqEnsureUser,
  ReqListTenantsByUser,
  ReqUpdateUserTenant,
  ReqCloudSessionToken,
  ReqTokenByResultId,
  ReqListLedgersByUser,
  ReqCreateLedger,
  ReqUpdateLedger,
  ReqDeleteLedger,
  ResTokenByResultId,
} from "./msg-types.js";

interface FPApiMsgInterface {
  isDeleteTenant(jso: unknown): jso is ReqDeleteTenant;
  isUpdateTenant(jso: unknown): jso is ReqUpdateTenant;
  isCreateTenant(jso: unknown): jso is ReqCreateTenant;
  isDeleteInvite(jso: unknown): jso is ReqDeleteInvite;
  isListInvites(jso: unknown): jso is ReqListInvites;
  isInviteUser(jso: unknown): jso is ReqInviteUser;
  isFindUser(jso: unknown): jso is ReqFindUser;
  isRedeemInvite(jso: unknown): jso is ReqRedeemInvite;
  isEnsureUser(jso: unknown): jso is ReqEnsureUser;
  isListTenantsByUser(jso: unknown): jso is ReqListTenantsByUser;
  isUpdateUserTenant(jso: unknown): jso is ReqUpdateUserTenant;
  isCloudSessionToken(jso: unknown): jso is ReqCloudSessionToken;
  isReqTokenByResultId(jso: unknown): jso is ReqTokenByResultId;
  isResTokenByResultId(jso: unknown): jso is ResTokenByResultId;
}

export class FAPIMsgImpl implements FPApiMsgInterface {
  isDeleteTenant(jso: unknown): jso is ReqDeleteTenant {
    return (jso as ReqDeleteTenant).type === "reqDeleteTenant";
  }
  isUpdateTenant(jso: unknown): jso is ReqUpdateTenant {
    return (jso as ReqUpdateTenant).type === "reqUpdateTenant";
  }
  isCreateTenant(jso: unknown): jso is ReqCreateTenant {
    return (jso as ReqCreateTenant).type === "reqCreateTenant";
  }
  isDeleteInvite(jso: unknown): jso is ReqDeleteInvite {
    return (jso as ReqDeleteInvite).type === "reqDeleteInvite";
  }
  isListInvites(jso: unknown): jso is ReqListInvites {
    return (jso as ReqListInvites).type === "reqListInvites";
  }
  isInviteUser(jso: unknown): jso is ReqInviteUser {
    return (jso as ReqInviteUser).type === "reqInviteUser";
  }
  isFindUser(jso: unknown): jso is ReqFindUser {
    return (jso as ReqFindUser).type === "reqFindUser";
  }
  isRedeemInvite(jso: unknown): jso is ReqRedeemInvite {
    return (jso as ReqRedeemInvite).type === "reqRedeemInvite";
  }
  isEnsureUser(jso: unknown): jso is ReqEnsureUser {
    return (jso as ReqEnsureUser).type === "reqEnsureUser";
  }

  isListTenantsByUser(jso: unknown): jso is ReqListTenantsByUser {
    return (jso as ReqListTenantsByUser).type === "reqListTenantsByUser";
  }
  isUpdateUserTenant(jso: unknown): jso is ReqUpdateUserTenant {
    return (jso as ReqUpdateUserTenant).type === "reqUpdateUserTenant";
  }
  isListLedgersByUser(jso: unknown): jso is ReqListLedgersByUser {
    return (jso as ReqListLedgersByUser).type === "reqListLedgersByUser";
  }

  isCreateLedger(jso: unknown): jso is ReqCreateLedger {
    return (jso as ReqCreateLedger).type === "reqCreateLedger";
  }
  isUpdateLedger(jso: unknown): jso is ReqUpdateLedger {
    return (jso as ReqUpdateLedger).type === "reqUpdateLedger";
  }
  isDeleteLedger(jso: unknown): jso is ReqDeleteLedger {
    return (jso as ReqDeleteLedger).type === "reqDeleteLedger";
  }

  isCloudSessionToken(jso: unknown): jso is ReqCloudSessionToken {
    return (jso as ReqCloudSessionToken).type === "reqCloudSessionToken";
  }
  isReqTokenByResultId(jso: unknown): jso is ReqTokenByResultId {
    return (jso as ReqTokenByResultId).type === "reqTokenByResultId";
  }
  isResTokenByResultId(jso: unknown): jso is ResTokenByResultId {
    return (jso as ResTokenByResultId).type === "resTokenByResultId";
  }
}
