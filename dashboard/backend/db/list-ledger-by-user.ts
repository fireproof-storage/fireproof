import { Result } from "@adviser/cement";
import { ActiveUserWithUserId, ReqListLedgersByUser, ResListLedgersByUser } from "@fireproof/core-protocols-dashboard";
import { and, eq, inArray } from "drizzle-orm";
import { sqlLedgerUsers, sqlLedgers, sqlToLedgers } from "../ledgers.js";
import { BackendContext } from "./context.js";

export async function dbListLedgersByUser(
  { db }: BackendContext,
  auth: ActiveUserWithUserId,
  req: ReqListLedgersByUser,
): Promise<Result<ResListLedgersByUser>> {
  // const now = new Date().toISOString();
  let condition = and(eq(sqlLedgerUsers.userId, auth.user.userId));
  if (req.tenantIds && req.tenantIds.length) {
    condition = and(condition, inArray(sqlLedgers.tenantId, req.tenantIds));
  }
  const rows = await db
    .select()
    .from(sqlLedgers)
    .innerJoin(sqlLedgerUsers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId)))
    .where(condition)
    .all();
  return Result.Ok({
    type: "resListLedgersByUser",
    userId: auth.user.userId,
    ledgers: sqlToLedgers(rows),
  });
}
