import { Result } from "@adviser/cement";
import { ReqCloudSessionToken, ResCloudSessionToken } from "@fireproof/core-protocols-dashboard";
import { FPCloudClaim } from "@fireproof/core-types-protocols-cloud";
import { UserNotFoundError } from "../sql/users.js";
import { getFPTokenContext, createFPToken, toProvider } from "../utils/index.js";
import { FPApiSQLCtx, FPTokenContext } from "../types.js";
import { listTenantsByUser } from "./list-tenants-by-user.js";
import { activeUser } from "../internal/auth.js";
import { listLedgersByUser } from "./list-ledgers-by-user.js";
import { addTokenByResultId } from "../internal/add-token-by-result-id.js";

export async function getCloudSessionToken(
  ctx: FPApiSQLCtx,
  req: ReqCloudSessionToken,
  ictx: Partial<FPTokenContext> = {},
): Promise<Result<ResCloudSessionToken>> {
  const resListTenants = await listTenantsByUser(ctx, {
    type: "reqListTenantsByUser",
    auth: req.auth,
  });
  if (resListTenants.isErr()) {
    return Result.Err(resListTenants.Err());
  }

  const resListLedgers = await listLedgersByUser(ctx, {
    type: "reqListLedgersByUser",
    auth: req.auth,
  });

  if (resListLedgers.isErr()) {
    return Result.Err(resListLedgers.Err());
  }
  const rCtx = await getFPTokenContext(ctx.sthis, ictx);
  if (rCtx.isErr()) {
    return Result.Err(rCtx.Err());
  }
  const fpCtx = rCtx.Ok();
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
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
    userId: auth.user.userId,
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
      .filter((i) => i) as FPCloudClaim["ledgers"],
    email: auth.verifiedAuth.params.email,
    nickname: auth.verifiedAuth.params.nick,
    provider: toProvider(auth.verifiedAuth),
    created: auth.user.createdAt,
    selected: {
      tenant: req.selected?.tenant ?? resListTenants.Ok().tenants[0]?.tenantId,
      ledger: req.selected?.ledger ?? resListLedgers.Ok().ledgers[0]?.ledgerId,
    },
  } satisfies FPCloudClaim);

  // console.log("getCloudSessionToken", {
  //   result: req.resultId,
  // });
  if (req.resultId && req.resultId.length > "laenger".length) {
    await addTokenByResultId(ctx, {
      status: "found",
      resultId: req.resultId,
      token: token.token,
      now: new Date(),
    });
  } else if (req.resultId) {
    ctx.sthis.logger.Warn().Any({ resultId: req.resultId }).Msg("resultId too short");
  }
  return Result.Ok({
    type: "resCloudSessionToken",
    token: token.token,
  });
}
