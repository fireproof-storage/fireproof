import { QueryUser, InviteTicket } from "@fireproof/core-protocols-dashboard";
import { and, eq, lt } from "drizzle-orm";
import { sqlInviteTickets, sqlToInviteTickets } from "../sql/invites.js";
import { queryCondition } from "../sql/sql-helper.js";
import { FPApiSQLCtx } from "../types.js";

export async function findInvite(
  ctx: FPApiSQLCtx,
  req: {
    query?: QueryUser;
    inviteId?: string;
    tenantId?: string;
    ledgerId?: string;
    // now?: Date
  },
): Promise<InviteTicket[]> {
  if (!(req.inviteId || req.query)) {
    throw new Error("inviteId or query is required");
  }
  // Allow both tenantId and ledgerId - this is needed when inviting to a ledger
  // (the tenant is extracted from the ledger for quota checking)
  // Removed validation that incorrectly rejected: if (req.tenantId && req.ledgerId)
  // housekeeping
  await ctx.db
    .update(sqlInviteTickets)
    .set({ status: "expired" })
    .where(and(eq(sqlInviteTickets.status, "pending"), lt(sqlInviteTickets.expiresAfter, new Date().toISOString())))
    .run();
  let condition = and();
  // eq(sqlInviteTickets.status, "pending"),
  // gt(sqlInviteTickets.expiresAfter, (req.now ?? new Date()).toISOString()),

  if (req.tenantId) {
    condition = and(eq(sqlInviteTickets.invitedTenantId, req.tenantId), condition);
  }
  if (req.ledgerId) {
    condition = and(eq(sqlInviteTickets.invitedLedgerId, req.ledgerId), condition);
  }
  if (req.inviteId) {
    condition = and(eq(sqlInviteTickets.inviteId, req.inviteId), condition);
  }
  if (req.query) {
    condition = and(
      queryCondition(req.query, {
        ...sqlInviteTickets,
        userId: sqlInviteTickets.invitedUserId,
      }),
      condition,
    );
  }
  const rows = await ctx.db.select().from(sqlInviteTickets).where(condition).all();
  return sqlToInviteTickets(rows);
}
