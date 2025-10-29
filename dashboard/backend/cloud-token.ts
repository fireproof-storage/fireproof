import { Logger, Result } from "@adviser/cement";
import {
  ClerkVerifyAuth,
  ReqCloudDbToken,
  ReqCloudSessionToken,
  ResCloudDbToken,
  ResCloudSessionToken,
  ResTokenByResultId,
} from "@fireproof/core-protocols-dashboard";
import { FPCloudClaim, toRole } from "@fireproof/core-types-protocols-cloud";
import { lt, eq, and } from "drizzle-orm";
import { FPTokenContext, getFPTokenContext, createFPToken } from "./create-fp-token.js";
import { sqlTokenByResultId } from "./token-by-result-id.js";
import { UserNotFoundError } from "./users.js";
import { ActiveWithUser, FPApiSQL, isActiveWithUser, TokenByResultIdParam } from "./api.js";
import { sqlLedgers, sqlLedgerUsers } from "./ledgers.js";
import { sqlTenantUsers } from "./tenants.js";
import { ensureLogger } from "@fireproof/core-runtime";
import { sqlBoundLocalDbnames } from "./bound-local-dbname.js";

function toProvider(i: ClerkVerifyAuth): FPCloudClaim["provider"] {
  if (i.params.nick) {
    return "github";
  }
  return "google";
}

async function upsertBoundLocalDbname(
  api: FPApiSQL,
  appId: string,
  localDbName: string,
  tenantId: string,
  ledgerId: string,
  deviceId: string,
): Promise<Result<void>> {
  const now = new Date().toISOString();
  const results = await api.db
    .insert(sqlBoundLocalDbnames)
    .values({
      appId,
      localDbName,
      tenantId,
      ledgerId,
      deviceIds: JSON.stringify([deviceId]),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sqlBoundLocalDbnames.appId, sqlBoundLocalDbnames.localDbName],
      set: {
        updatedAt: now,
      },
    })
    .returning();
  if (results.length !== 1) {
    return Result.Err("Failed to upsert bound local dbname");
  }
  const result = results[0];
  if (result.deviceIds) {
    const deviceIds: string[] = JSON.parse(result.deviceIds ?? "[]");
    const uniqueDeviceIds = Array.from(new Set([...deviceIds, deviceId])).sort();
    if (uniqueDeviceIds.length !== deviceIds.length) {
      await api.db
        .update(sqlBoundLocalDbnames)
        .set({
          deviceIds: JSON.stringify(uniqueDeviceIds),
          updatedAt: now,
        })
        .where(and(eq(sqlBoundLocalDbnames.appId, appId), eq(sqlBoundLocalDbnames.localDbName, localDbName)))
        .run();
    }
  }
  return Result.Ok(undefined);
}

async function createBoundToken(
  req: { ledgerId: string; tenantId: string },
  api: FPApiSQL,
  auth: ActiveWithUser<ClerkVerifyAuth>,
  logger: Logger,
  ctx: FPTokenContext,
): Promise<Result<ResCloudDbToken>> {
  const tandl = await api.db
    .select()
    .from(sqlLedgers)
    .innerJoin(sqlTenantUsers, eq(sqlLedgers.tenantId, sqlTenantUsers.tenantId))
    .innerJoin(sqlLedgerUsers, eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId))
    .where(and(eq(sqlLedgers.ledgerId, req.ledgerId), eq(sqlLedgers.tenantId, req.tenantId)))
    .get();
  if (tandl) {
    // console.log("createBoundToken", auth);
    return Result.Ok({
      type: "resCloudDbToken",
      status: "bound",
      token: await createFPToken(ctx, {
        userId: auth.user.userId,
        tenants: [{ id: req.tenantId, role: toRole(tandl.TenantUsers.role) }],
        ledgers: [
          {
            id: req.ledgerId,
            role: toRole(tandl.LedgerUsers.role),
            right: tandl.LedgerUsers.right as "read" | "write",
          },
        ],
        email: auth.verifiedAuth.params.email,
        nickname: auth.verifiedAuth.params.nick,
        provider: toProvider(auth.verifiedAuth),
        created: auth.user.createdAt,
        selected: {
          tenant: req.tenantId,
          ledger: req.ledgerId,
        },
      } satisfies FPCloudClaim),
    });
  }
  return logger
    .Error()
    .Any({ ...req })
    .Msg("User has no access to tenant or ledger")
    .ResultError();
}

export async function getCloudDbToken(
  api: FPApiSQL,
  req: ReqCloudDbToken,
  ictx: Partial<FPTokenContext>,
): Promise<Result<ResCloudDbToken>> {
  const logger = ensureLogger(api.sthis, "getCloudDbToken", {
    appId: req.appId,
    deviceId: req.deviceId,
    localDbName: req.localDbName,
  });
  const rCtx = await getFPTokenContext(api.sthis, ictx);
  if (rCtx.isErr()) {
    return Result.Err(rCtx.Err());
  }
  const ctx = rCtx.Ok();
  const rAuth = await api.activeUser(req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!isActiveWithUser(auth)) {
    return Result.Err(new UserNotFoundError());
  }
  if (req.tenantId && req.ledgerId) {
    // check if user has access to tenant and ledger
    return createBoundToken(
      {
        ledgerId: req.ledgerId,
        tenantId: req.tenantId,
      },
      api,
      auth,
      logger,
      ctx,
    );
  }
  const binding = await api.db
    .select()
    .from(sqlBoundLocalDbnames)
    .where(and(eq(sqlBoundLocalDbnames.appId, req.appId), eq(sqlBoundLocalDbnames.localDbName, req.localDbName)))
    .get();
  if (binding) {
    return createBoundToken(
      {
        ledgerId: binding.ledgerId,
        tenantId: binding.tenantId,
      },
      api,
      auth,
      logger,
      ctx,
    );
  }

  let tenantToCreateLedger: string;
  // console.log("No binding found for localDbName:", req.localDbName, "appId:", req.appId, "tenantId:", req.tenantId);
  if (!req.tenantId) {
    const rListLedgers = await api.listLedgersByUser({
      type: "reqListLedgersByUser",
      auth: req.auth,
    });
    if (rListLedgers.isErr()) {
      return Result.Err(rListLedgers.Err());
    }
    const ledgersPerTenant = rListLedgers.Ok().ledgers.filter((l) => l.name === req.localDbName);
    // console.log("Ledgers with names for user:", auth.user.userId, ledgersPerTenant);
    if (ledgersPerTenant.length === 1) {
      return createBoundToken(
        {
          ledgerId: ledgersPerTenant[0].ledgerId,
          tenantId: ledgersPerTenant[0].tenantId,
        },
        api,
        auth,
        logger,
        ctx,
      );
    }
    if (ledgersPerTenant.length > 1) {
      return Result.Ok({
        type: "resCloudDbToken",
        status: "not-bound",
        reason: "Multiple ledgers exist for user; with the same name existing",
        ledgers: ledgersPerTenant.map((l) => ({
          ledgerId: l.ledgerId,
          tenantId: l.tenantId,
          name: l.name,
        })),
      });
    }
    const rListTenants = await api.listTenantsByUser({
      type: "reqListTenantsByUser",
      auth: req.auth,
    });
    if (rListTenants.isErr()) {
      return Result.Err(rListTenants);
    }
    if (rListTenants.Ok().tenants.length === 0) {
      return logger.Error().Any({ userId: auth.user.userId }).Msg("User has no tenants").ResultError();
    }
    const defaultTenant = rListTenants.Ok().tenants.find((i) => i.default);
    if (!defaultTenant) {
      return logger.Error().Any({ userId: auth.user.userId }).Msg("User has no default tenant").ResultError();
    }

    // console.log("Using default tenant for user:", auth.user.userId, "->", defaultTenant.tenantId, rListTenants.Ok().tenants);
    tenantToCreateLedger = defaultTenant.tenantId;

    // get all ledgers for user
    // checkIf localName is as LedgerName
    //     return unbound token
    // getDefault tenant for user
  } else {
    tenantToCreateLedger = req.tenantId;
    const rListLedgers = await api.listLedgersByUser({
      type: "reqListLedgersByUser",
      auth: req.auth,
      tenantIds: [req.tenantId],
    });
    if (rListLedgers.isErr()) {
      return Result.Err(rListLedgers.Err());
    }
    const ledgersPerTenant = rListLedgers.Ok().ledgers.filter((l) => l.name);
    if (ledgersPerTenant.length === 1) {
      return createBoundToken(
        {
          ledgerId: ledgersPerTenant[0].ledgerId,
          tenantId: ledgersPerTenant[0].tenantId,
        },
        api,
        auth,
        logger,
        ctx,
      );
    }
    if (ledgersPerTenant.length > 1) {
      return Result.Ok({
        type: "resCloudDbToken",
        status: "not-bound",
        reason: "Multiple ledgers exist for user; with the same name existing",
        ledgers: ledgersPerTenant.map((l) => ({
          ledgerId: l.ledgerId,
          tenantId: l.tenantId,
          name: l.name,
        })),
      });
    }
  }
  // create ledger with localDbName in tenant
  const rCreateLedger = await api.createLedger({
    type: "reqCreateLedger",
    auth: req.auth,
    ledger: {
      tenantId: tenantToCreateLedger,
      name: req.localDbName,
    },
  });
  if (rCreateLedger.isErr()) {
    return Result.Err(rCreateLedger.Err());
  }
  await upsertBoundLocalDbname(
    api,
    req.appId,
    req.localDbName,
    tenantToCreateLedger,
    rCreateLedger.Ok().ledger.ledgerId,
    req.deviceId,
  );

  // create bound localDbName token
  return createBoundToken(
    {
      ledgerId: rCreateLedger.Ok().ledger.ledgerId,
      tenantId: tenantToCreateLedger,
    },
    api,
    auth,
    logger,
    ctx,
  );
}

export async function getCloudSessionToken(
  api: FPApiSQL,
  req: ReqCloudSessionToken,
  ictx: Partial<FPTokenContext>,
): Promise<Result<ResCloudSessionToken>> {
  const resListTenants = await api.listTenantsByUser({
    type: "reqListTenantsByUser",
    auth: req.auth,
  });
  if (resListTenants.isErr()) {
    return Result.Err(resListTenants.Err());
  }

  const resListLedgers = await api.listLedgersByUser({
    type: "reqListLedgersByUser",
    auth: req.auth,
  });

  if (resListLedgers.isErr()) {
    return Result.Err(resListLedgers.Err());
  }
  const rCtx = await getFPTokenContext(api.sthis, ictx);
  if (rCtx.isErr()) {
    return Result.Err(rCtx.Err());
  }
  const ctx = rCtx.Ok();
  const rAuth = await api.activeUser(req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!isActiveWithUser(auth)) {
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
  const token = await createFPToken(ctx, {
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
    await addTokenByResultId(api, {
      status: "found",
      resultId: req.resultId,
      token,
      now: new Date(),
    });
    // console.log("getCloudSessionToken-ok", {
    //   result: req.resultId,
    // });
  } else if (req.resultId) {
    api.sthis.logger.Warn().Any({ resultId: req.resultId }).Msg("resultId too short");
    // console.log("getCloudSessionToken-failed", {
    // result: req.resultId,
    // });
  }
  // console.log(">>>>-post:", ctx, privKey)
  return Result.Ok({
    type: "resCloudSessionToken",
    token,
  });
}

async function addTokenByResultId(api: FPApiSQL, req: TokenByResultIdParam): Promise<Result<ResTokenByResultId>> {
  const now = (req.now ?? new Date()).toISOString();
  await api.db
    .insert(sqlTokenByResultId)
    .values({
      resultId: req.resultId,
      status: req.status,
      token: req.token,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sqlTokenByResultId.resultId],
      set: {
        updatedAt: now,
        resultId: req.resultId,
        token: req.token,
        status: req.status,
      },
    })
    .run();
  const past = new Date(new Date(now).getTime() - 15 * 60 * 1000).toISOString();
  await api.db.delete(sqlTokenByResultId).where(lt(sqlTokenByResultId.updatedAt, past)).run();
  return Result.Ok({
    type: "resTokenByResultId",
    ...req,
  });
}
