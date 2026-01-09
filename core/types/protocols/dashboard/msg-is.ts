import { Result, Option } from "@adviser/cement";
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
  ReqExtendToken,
  ReqCertFromCsr,
  ReqEnsureCloudToken,
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
  isReqExtendToken(jso: unknown): jso is ReqExtendToken;
  isReqCertFromCsr(jso: unknown): jso is ReqCertFromCsr;
  isEnsureCloudToken(jso: unknown): jso is ReqEnsureCloudToken;
}

function hasType(jso: unknown, t: string): jso is { type: string } {
  return typeof jso === "object" && jso !== null && (jso as { type?: unknown }).type === t;
}

export async function validateDeleteTenant<T extends ReqDeleteTenant>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqDeleteTenant")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateUpdateTenant<T extends ReqUpdateTenant>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqUpdateTenant")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateCreateTenant<T extends ReqCreateTenant>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqCreateTenant")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateCreateLedger<T extends ReqCreateLedger>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqCreateLedger")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateDeleteLedger<T extends ReqDeleteLedger>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqDeleteLedger")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateUpdateLedger<T extends ReqUpdateLedger>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqUpdateLedger")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateListInvites<T extends ReqListInvites>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqListInvites")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateInviteUser<T extends ReqInviteUser>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqInviteUser")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateFindUser<T extends ReqFindUser>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqFindUser")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateRedeemInvite<T extends ReqRedeemInvite>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqRedeemInvite")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateListTenantsByUser<T extends ReqListTenantsByUser>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqListTenantsByUser")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateUpdateUserTenant<T extends ReqUpdateUserTenant>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqUpdateUserTenant")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateListLedgersByUser<T extends ReqListLedgersByUser>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqListLedgersByUser")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateDeleteInvite<T extends ReqDeleteInvite>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqDeleteInvite")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateCloudSessionToken<T extends ReqCloudSessionToken>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqCloudSessionToken")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateTokenByResultId<T extends ReqTokenByResultId>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqTokenByResultId")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateCertFromCsr<T extends ReqCertFromCsr>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqCertFromCsr")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateEnsureUser<T extends ReqEnsureUser>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqEnsureUser")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
}

export async function validateEnsureCloudToken<T extends ReqEnsureCloudToken>(jso: unknown): Promise<Result<Option<T>>> {
  if (hasType(jso, "reqEnsureCloudToken")) {
    return Result.Ok(Option.Some(jso as T));
  }
  return Result.Ok(Option.None());
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
  isReqExtendToken(jso: unknown): jso is ReqExtendToken {
    return hasType(jso, "reqExtendToken");
  }
  isReqCertFromCsr(jso: unknown): jso is ReqCertFromCsr {
    return hasType(jso, "reqCertFromCsr");
  }
  isEnsureCloudToken(jso: unknown): jso is ReqEnsureCloudToken {
    return hasType(jso, "reqEnsureCloudToken");
  }
}
