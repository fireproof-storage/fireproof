import { Result } from "@adviser/cement";
import { ReqRedeemInvite, ResRedeemInvite } from "@fireproof/core-protocols-dashboard";
import { and, eq } from "drizzle-orm";
import { sqlToInviteTickets, sqlInviteTickets } from "../sql/invites.js";
import { sqlLedgers } from "../sql/ledgers.js";
import { sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { findInvite } from "../internal/find-invite.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";
import { addUserToLedger } from "../internal/add-user-to-ledger.js";

export async function redeemInvite(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqRedeemInvite>,
): Promise<Result<ResRedeemInvite>> {
  const query = {
    byString: req.auth.verifiedAuth.params.email,
    byNick: req.auth.verifiedAuth.params.nick,
    existingUserId: req.auth.user.userId,
  };
  console.log("[redeemInvite p0.47] searching with query:", JSON.stringify(query));
  const foundInvites = await findInvite(ctx, { query });
  console.log("[redeemInvite p0.47] found invites:", foundInvites.length, "pending:", foundInvites.filter((i) => i.status === "pending").length);
  if (foundInvites.length > 0) {
    console.log("[redeemInvite p0.47] invite details:", JSON.stringify(foundInvites.map((i) => ({ id: i.inviteId, status: i.status, queryEmail: i.query.byEmail, ledger: i.invitedParams.ledger?.id }))));
  }
  return Result.Ok({
    type: "resRedeemInvite",
    invites: sqlToInviteTickets(
      await Promise.all(
        foundInvites
          .filter((i) => i.status === "pending")
          .map(async (invite) => {
            if (invite.invitedParams.tenant) {
              const tenant = await ctx.db
                .select()
                .from(sqlTenants)
                .where(and(eq(sqlTenants.tenantId, invite.invitedParams.tenant.id), eq(sqlTenants.status, "active")))
                .get();
              if (!tenant) {
                throw new Error("tenant not found");
              }
              await addUserToTenant(ctx, {
                userName: `invited from [${tenant.name}]`,
                tenantId: tenant.tenantId,
                userId: req.auth.user.userId,
                role: invite.invitedParams.tenant.role,
              });
            }
            if (invite.invitedParams.ledger) {
              const ledger = await ctx.db
                .select()
                .from(sqlLedgers)
                .where(and(eq(sqlLedgers.ledgerId, invite.invitedParams.ledger.id), eq(sqlLedgers.status, "active")))
                .get();
              if (!ledger) {
                throw new Error("ledger not found");
              }
              await addUserToLedger(ctx, {
                userName: `invited-${ledger.name}`,
                ledgerId: ledger.ledgerId,
                tenantId: ledger.tenantId,
                userId: req.auth.user.userId,
                role: invite.invitedParams.ledger.role,
                right: invite.invitedParams.ledger.right,
              });
            }
            return (
              await ctx.db
                .update(sqlInviteTickets)
                .set({
                  invitedUserId: req.auth.user.userId,
                  status: "accepted",
                  statusReason: `accepted: ${req.auth.user.userId}`,
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(sqlInviteTickets.inviteId, invite.inviteId))
                .returning()
            )[0];
          }),
      ),
    ),
  });
}
