import { Result } from "@adviser/cement";
import { ReqRedeemInvite, ResRedeemInvite } from "@fireproof/core-protocols-dashboard";
import { and, eq } from "drizzle-orm";
import { sqlToInviteTickets, sqlInviteTickets } from "../sql/invites.js";
import { sqlLedgers } from "../sql/ledgers.js";
import { sqlTenants } from "../sql/tenants.js";
import { UserNotFoundError } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";
import { findInvite } from "../internal/find-invite.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";
import { addUserToLedger } from "../internal/add-user-to-ledger.js";

export async function redeemInvite(ctx: FPApiSQLCtx, req: ReqRedeemInvite): Promise<Result<ResRedeemInvite>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  return Result.Ok({
    type: "resRedeemInvite",
    invites: sqlToInviteTickets(
      await Promise.all(
        (
          await findInvite(ctx, {
            query: {
              byString: auth.verifiedAuth.params.email,
              byNick: auth.verifiedAuth.params.nick,
              existingUserId: auth.user.userId,
              // TODO
              // andProvider: auth.verifiedAuth.provider,
            },
          })
        )
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
              if (!auth.user) {
                throw new UserNotFoundError();
              }
              await addUserToTenant(ctx, {
                userName: `invited from [${tenant.name}]`,
                tenantId: tenant.tenantId,
                userId: auth.user?.userId,
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
              if (!auth.user) {
                throw new UserNotFoundError();
              }
              await addUserToLedger(ctx, {
                userName: `invited-${ledger.name}`,
                ledgerId: ledger.ledgerId,
                tenantId: ledger.tenantId,
                userId: auth.user?.userId,
                role: invite.invitedParams.ledger.role,
                right: invite.invitedParams.ledger.right,
              });
            }
            return (
              await ctx.db
                .update(sqlInviteTickets)
                .set({
                  invitedUserId: auth.user?.userId,
                  status: "accepted",
                  statusReason: `accepted: ${auth.user?.userId}`,
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
