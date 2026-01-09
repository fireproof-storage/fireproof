import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqUpdateLedger, ResUpdateLedger, validateUpdateLedger } from "@fireproof/core-types-protocols-dashboard";
import { Role, ReadWrite } from "@fireproof/core-types-protocols-cloud";
import { and, eq, ne } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "../sql/ledgers.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { isAdminOfLedger } from "../internal/is-admin-of-ledger.js";
import { checkAuth, wrapStop } from "../utils/index.js";

async function updateLedger(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqUpdateLedger>): Promise<Result<ResUpdateLedger>> {
  const now = new Date().toISOString();
  // check if owner or admin of tenant
  if (!(await isAdminOfLedger(ctx, req.auth.user.userId, req.ledger.ledgerId))) {
    if (req.ledger.name) {
      await ctx.db
        .update(sqlLedgerUsers)
        .set({
          name: req.ledger.name,
          updatedAt: now,
        })
        .where(and(eq(sqlLedgerUsers.userId, req.auth.user.userId), eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)))
        .run();
    }
    const rows = await ctx.db
      .select()
      .from(sqlLedgers)
      .innerJoin(sqlLedgerUsers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId)))
      .where(
        and(
          eq(sqlLedgerUsers.userId, req.auth.user.userId),
          eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId),
          ne(sqlLedgerUsers.role, "admin"),
        ),
      )
      .all();
    return Result.Ok({
      type: "resUpdateLedger",
      ledger: sqlToLedgers(rows)[0],
    });
  }
  const role = {
    updatedAt: now,
  } as {
    readonly updatedAt: string;
    default?: number;
    name?: string;
    role?: Role;
    right?: ReadWrite;
  };
  if (typeof req.ledger.default === "boolean") {
    role.default = req.ledger.default ? 1 : 0;
    if (req.ledger.default) {
      // switch default
      await ctx.db
        .update(sqlLedgerUsers)
        .set({
          default: 0,
          updatedAt: now,
        })
        .where(and(eq(sqlLedgerUsers.userId, req.auth.user.userId), ne(sqlLedgerUsers.default, 0)))
        .run();
    }
  }
  const ledger = {
    name: req.ledger.name,
    updatedAt: now,
  };
  if (req.ledger.name) {
    role.name = req.ledger.name;
    ledger.name = req.ledger.name;
  }
  if (req.ledger.right) {
    role.right = req.ledger.right;
  }
  if (req.ledger.role) {
    role.role = req.ledger.role;
  }
  const roles = await ctx.db.update(sqlLedgerUsers).set(role).where(eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)).returning();
  const ledgers = await ctx.db.update(sqlLedgers).set(ledger).where(eq(sqlLedgers.ledgerId, req.ledger.ledgerId)).returning();
  return Result.Ok({
    type: "resUpdateLedger",
    ledger: sqlToLedgers([
      {
        Ledgers: ledgers[0],
        LedgerUsers: roles[0],
      },
    ])[0],
  });
}

export const updateLedgerItem: EventoHandler<Request, ReqUpdateLedger, ResUpdateLedger> = {
  hash: "update-ledger",
  validate: (ctx) => validateUpdateLedger(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqUpdateLedger>, ResUpdateLedger>,
    ): Promise<Result<EventoResultType>> => {
      const res = await updateLedger(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};
