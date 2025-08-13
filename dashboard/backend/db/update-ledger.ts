import { Result } from "@adviser/cement";
import { ActiveUserWithUserId, ReqUpdateLedger, ResUpdateLedger } from "@fireproof/core-protocols-dashboard";
import { Role, ReadWrite } from "@fireproof/core-types-protocols-cloud";
import { and, eq, ne } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "../ledgers.js";
import { BackendContext } from "./context.js";
import { isAdminOfLedger } from "./is-admin-of-ledger.js";

export async function dbUpdateLedger(
  bctx: BackendContext,
  auth: ActiveUserWithUserId,
  req: ReqUpdateLedger,
): Promise<Result<ResUpdateLedger>> {
  const now = new Date().toISOString();
  // check if owner or admin of tenant
  if (!(await isAdminOfLedger(bctx, auth.user.userId, req.ledger.ledgerId))) {
    if (req.ledger.name) {
      await bctx.db
        .update(sqlLedgerUsers)
        .set({
          name: req.ledger.name,
          updatedAt: now,
        })
        .where(and(eq(sqlLedgerUsers.userId, auth.user.userId), eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)))
        .run();
    }
    const rows = await bctx.db
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
      await bctx.db
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
  const roles = await bctx.db.update(sqlLedgerUsers).set(role).where(eq(sqlLedgerUsers.ledgerId, req.ledger.ledgerId)).returning();
  const ledgers = await bctx.db.update(sqlLedgers).set(ledger).where(eq(sqlLedgers.ledgerId, req.ledger.ledgerId)).returning();
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
