import { Result } from "@adviser/cement";
import {
  ActiveUserWithUserId,
  ClerkVerifyAuth,
  ReqCloudSessionToken,
  ResCloudSessionToken,
  toProvider,
} from "@fireproof/core-protocols-dashboard";
import { FPTokenContext, createFPToken } from "../create-fp-token.js";
import { BackendContext } from "./context.js";
import { dbListTenantsByUser } from "./list-tenant-by-user.js";
import { dbListLedgersByUser } from "./list-ledger-by-user.js";
import { FPUserToken } from "@fireproof/core-types-protocols-cloud";
import { dbAddTokenByResultId } from "./add-token-by-result-id.js";

export async function dbGetCloudSessionToken(
  bctx: BackendContext,
  auth: ActiveUserWithUserId<ClerkVerifyAuth>,
  req: ReqCloudSessionToken,
  fpCtx: FPTokenContext,
): Promise<Result<ResCloudSessionToken>> {
  const resListTenants = await dbListTenantsByUser(bctx, auth);
  if (resListTenants.isErr()) {
    return Result.Err(resListTenants.Err());
  }

  const resListLedgers = await dbListLedgersByUser(bctx, auth, {
    type: "reqListLedgersByUser",
    auth: req.auth,
  });

  if (resListLedgers.isErr()) {
    return Result.Err(resListLedgers.Err());
  }

  // verify if tenant and ledger are valid
  const selected = {
    tenant: resListTenants.Ok().tenants[0]?.tenantId,
    ledger: resListLedgers.Ok().ledgers[0]?.ledgerId,
  };
  if (
    req.selected?.tenant &&
    resListTenants
      .Ok()
      .tenants.map((i) => i.tenantId)
      .includes(req.selected?.tenant)
  ) {
    selected.tenant = req.selected?.tenant;
  }
  if (
    req.selected?.ledger &&
    resListLedgers
      .Ok()
      .ledgers.map((i) => i.ledgerId)
      .includes(req.selected?.ledger)
  ) {
    selected.ledger = req.selected?.ledger;
  }
  const token = await createFPToken(fpCtx, {
    userId: auth.user?.userId,
    tenants: resListTenants.Ok().tenants.map((i) => ({
      id: i.tenantId,
      role: i.role,
    })),
    ledgers: resListLedgers
      .Ok()
      .ledgers.map((i) => {
        const rights = i.users.find((u) => u.userId === auth.user?.userId);
        if (!rights) {
          return undefined;
        }
        return {
          id: i.ledgerId,
          role: rights.role,
          right: rights.right,
        };
      })
      .filter((i) => i) as FPUserToken["ledgers"],
    email: auth.verifiedAuth.params.email,
    nickname: auth.verifiedAuth.params.nick,
    provider: toProvider(auth.verifiedAuth),
    created: auth.user.createdAt,
    selected: {
      tenant: req.selected?.tenant ?? resListTenants.Ok().tenants[0]?.tenantId,
      ledger: req.selected?.ledger ?? resListLedgers.Ok().ledgers[0]?.ledgerId,
    },
  } satisfies FPUserToken);

  // console.log("getCloudSessionToken", {
  //   result: req.resultId,
  // });
  if (req.resultId && req.resultId.length > "laenger".length) {
    await dbAddTokenByResultId(bctx, {
      status: "found",
      resultId: req.resultId,
      token,
      now: new Date(),
    });
    // console.log("getCloudSessionToken-ok", {
    //   result: req.resultId,
    // });
  } else if (req.resultId) {
    bctx.sthis.logger.Warn().Any({ resultId: req.resultId }).Msg("resultId too short");
  }
  // console.log(">>>>-post:", ctx, privKey)
  return Result.Ok({
    type: "resCloudSessionToken",
    token,
  });
}
