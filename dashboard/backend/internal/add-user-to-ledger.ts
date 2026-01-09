import { Result } from "@adviser/cement";
import { UserStatus } from "@fireproof/core-protocols-dashboard";
import { toRole, toReadWrite } from "@fireproof/core-types-protocols-cloud";
import { and, eq, ne } from "drizzle-orm";
import { sqlLedgers, sqlLedgerUsers } from "../sql/ledgers.js";
import { toUndef } from "../sql/sql-helper.js";
import { sqlTenants } from "../sql/tenants.js";
import { AddUserToLedger, FPApiSQLCtx } from "../types.js";
import { getRoles } from "./get-roles.js";
import { checkMaxRoles } from "./check-max-roles.js";

export async function addUserToLedger(ctx: FPApiSQLCtx, req: AddUserToLedger): Promise<Result<AddUserToLedger>> {
  const ledger = await ctx.db
    .select()
    .from(sqlLedgers)
    .innerJoin(sqlTenants, and(eq(sqlLedgers.tenantId, sqlTenants.tenantId)))
    .where(and(eq(sqlLedgers.ledgerId, req.ledgerId), eq(sqlLedgers.status, "active")))
    .get();
  if (!ledger) {
    return Result.Err("ledger not found");
  }
  const roles = await getRoles(ctx, req.userId, [], [ledger.Ledgers]);
  if (roles.length > 1) {
    return Result.Err("multiple roles found");
  }
  if (roles.length && roles[0].role) {
    const ledgerUser = await ctx.db
      .select()
      .from(sqlLedgerUsers)
      .innerJoin(sqlLedgers, and(eq(sqlLedgerUsers.ledgerId, sqlLedgers.ledgerId)))
      .where(
        and(eq(sqlLedgerUsers.ledgerId, req.ledgerId), eq(sqlLedgerUsers.userId, req.userId), eq(sqlLedgerUsers.status, "active")),
      )
      .get();
    if (!ledgerUser) {
      return Result.Err("ref not found");
    }
    return Result.Ok({
      ledgerName: toUndef(ledgerUser.Ledgers.name),
      userName: toUndef(ledgerUser.LedgerUsers.name),
      ledgerId: ledgerUser.Ledgers.ledgerId,
      tenantId: ledgerUser.Ledgers.tenantId,
      userId: req.userId,
      default: !!ledgerUser.LedgerUsers.default,
      status: ledgerUser.LedgerUsers.status as UserStatus,
      statusReason: ledgerUser.LedgerUsers.statusReason,
      role: toRole(ledgerUser.LedgerUsers.role),
      right: toReadWrite(ledgerUser.LedgerUsers.right),
    });
  }
  const rCheck = await checkMaxRoles(ctx, ledger.Tenants, req.role);
  if (rCheck.isErr()) {
    return Result.Err(rCheck.Err());
  }
  const now = new Date().toISOString();
  if (req.default) {
    await ctx.db
      .update(sqlLedgerUsers)
      .set({
        default: 0,
        updatedAt: now,
      })
      .where(and(eq(sqlLedgerUsers.userId, req.userId), ne(sqlLedgerUsers.default, 0)))
      .run();
  }
  const inserted = await ctx.db
    .insert(sqlLedgerUsers)
    .values({
      ledgerId: ledger.Ledgers.ledgerId,
      userId: req.userId,
      name: req.userName,
      role: req.role,
      right: req.right,
      default: req.default ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    // User already exists in ledger, fetch existing record
    const existing = await ctx.db
      .select()
      .from(sqlLedgerUsers)
      .where(and(eq(sqlLedgerUsers.ledgerId, ledger.Ledgers.ledgerId), eq(sqlLedgerUsers.userId, req.userId)))
      .get();
    if (!existing) {
      return Result.Err("failed to insert or find ledger user");
    }
    return Result.Ok({
      ledgerName: toUndef(ledger.Ledgers.name),
      userName: toUndef(existing.name),
      ledgerId: ledger.Ledgers.ledgerId,
      tenantId: ledger.Ledgers.tenantId,
      status: existing.status as UserStatus,
      statusReason: existing.statusReason,
      userId: req.userId,
      default: !!existing.default,
      role: toRole(existing.role),
      right: toReadWrite(existing.right),
    });
  }
  const ret = inserted[0];
  return Result.Ok({
    ledgerName: toUndef(ledger.Ledgers.name),
    userName: req.userName,
    ledgerId: ledger.Ledgers.ledgerId,
    tenantId: ledger.Ledgers.tenantId,
    status: ret.status as UserStatus,
    statusReason: ret.statusReason,
    userId: req.userId,
    default: req.default ?? false,
    role: toRole(ret.role),
    right: toReadWrite(ret.right),
  });
}
