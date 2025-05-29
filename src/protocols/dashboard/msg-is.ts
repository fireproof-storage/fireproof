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
  isListLedgersByUser(jso: unknown): jso is ReqListLedgersByUser;
  isCreateLedger(jso: unknown): jso is ReqCreateLedger;
  isUpdateLedger(jso: unknown): jso is ReqUpdateLedger;
  isDeleteLedger(jso: unknown): jso is ReqDeleteLedger;
  isReqExtendToken(jso: unknown): jso is ReqTokenByResultId;
}

function hasType(jso: unknown, t: string): jso is { type: string } {
  return typeof jso === "object" && jso !== null && (jso as { type?: unknown }).type === t;
}
export class FAPIMsgImpl implements FPApiMsgInterface {
  isDeleteTenant(jso: unknown): jso is ReqDeleteTenant {
    return hasType(jso, "reqDeleteTenant");
  }
  isUpdateTenant(jso: unknown): jso is ReqUpdateTenant {
    return hasType(jso, "reqUpdateTenant");
  }
  isCreateTenant(jso: unknown): jso is ReqCreateTenant {
    return hasType(jso, "reqCreateTenant");
  }
  isDeleteInvite(jso: unknown): jso is ReqDeleteInvite {
    return hasType(jso, "reqDeleteInvite");
  }
  isListInvites(jso: unknown): jso is ReqListInvites {
    return hasType(jso, "reqListInvites");
  }
  isInviteUser(jso: unknown): jso is ReqInviteUser {
    return hasType(jso, "reqInviteUser");
  }
  isFindUser(jso: unknown): jso is ReqFindUser {
    return hasType(jso, "reqFindUser");
  }
  isRedeemInvite(jso: unknown): jso is ReqRedeemInvite {
    return hasType(jso, "reqRedeemInvite");
  }
  isEnsureUser(jso: unknown): jso is ReqEnsureUser {
    return hasType(jso, "reqEnsureUser");
  }
  isListTenantsByUser(jso: unknown): jso is ReqListTenantsByUser {
    return hasType(jso, "reqListTenantsByUser");
  }
  isUpdateUserTenant(jso: unknown): jso is ReqUpdateUserTenant {
    return hasType(jso, "reqUpdateUserTenant");
  }
  isListLedgersByUser(jso: unknown): jso is ReqListLedgersByUser {
    return hasType(jso, "reqListLedgersByUser");
  }
  isCreateLedger(jso: unknown): jso is ReqCreateLedger {
    return hasType(jso, "reqCreateLedger");
  }
  isUpdateLedger(jso: unknown): jso is ReqUpdateLedger {
    return hasType(jso, "reqUpdateLedger");
  }
  isDeleteLedger(jso: unknown): jso is ReqDeleteLedger {
    return hasType(jso, "reqDeleteLedger");
  }
  isCloudSessionToken(jso: unknown): jso is ReqCloudSessionToken {
    return hasType(jso, "reqCloudSessionToken");
  }
  isReqTokenByResultId(jso: unknown): jso is ReqTokenByResultId {
    return hasType(jso, "reqTokenByResultId");
  }
  isResTokenByResultId(jso: unknown): jso is ResTokenByResultId {
    return hasType(jso, "resTokenByResultId");
  }
  isReqExtendToken(jso: unknown): jso is ReqTokenByResultId {
    return hasType(jso, "reqExtendToken");
  }
}
