import { Result } from "@adviser/cement";
import { ReqUpdateLedger, ResUpdateLedger } from "@fireproof/core-protocols-dashboard";
import { Role, ReadWrite } from "@fireproof/core-types-protocols-cloud";
import { and, eq, ne } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "../sql/ledgers.js";
import { UserNotFoundError } from "../sql/users.js";
import { FPApiSQLCtx } from "../types.js";
import { activeUser } from "../internal/auth.js";
import { isAdminOfLedger } from "../internal/is-admin-of-ledger.js";

export async function updateLedger(ctx: FPApiSQLCtx, req: ReqUpdateLedger): Promise<Result<ResUpdateLedger>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  const now = new Date().toISOString();
  // check if owner or admin of tenant
  if (!(await isAdminOfLedger(ctx, auth.user.userId, req.ledger.ledgerId))) {
    if (req.ledger.name) {
      await ctx.db
        .update(sqlLedgerUsers)
        .set({
          name: req.ledger.name,
          updatedAt: now,
        })
        .where(and(eq(sqlLedgerUsers.userId, auth.user.userId), eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)))
        .run();
    }
    const rows = await ctx.db
      .select()
      .from(sqlLedgers)
      .innerJoin(sqlLedgerUsers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId)))
      .where(
        and(
          eq(sqlLedgerUsers.userId, auth.user.userId),
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
        .where(and(eq(sqlLedgerUsers.userId, auth.user.userId), ne(sqlLedgerUsers.default, 0)))
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
