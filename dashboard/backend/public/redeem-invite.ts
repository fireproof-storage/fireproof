import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqRedeemInvite, ResRedeemInvite, validateRedeemInvite } from "@fireproof/core-types-protocols-dashboard";
import { and, eq } from "drizzle-orm";
import { sqlToInviteTickets, sqlInviteTickets } from "../sql/invites.js";
import { sqlLedgers } from "../sql/ledgers.js";
import { sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { findInvite } from "../internal/find-invite.js";
import { addUserToTenant } from "../internal/add-user-to-tenant.js";
import { addUserToLedger } from "../internal/add-user-to-ledger.js";
import { checkAuth, wrapStop } from "../utils/index.js";

export async function redeemInvite(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqRedeemInvite>,
): Promise<Result<ResRedeemInvite>> {
  return Result.Ok({
    type: "resRedeemInvite",
    invites: sqlToInviteTickets(
      await Promise.all(
        (
          await findInvite(ctx, {
            query: {
              byString: req.auth.verifiedAuth.claims.params.email,
              byNick: req.auth.verifiedAuth.claims.params.nick,
              existingUserId: req.auth.user.userId,
              // TODO
              // andProvider: req.auth.verifiedAuth.provider,
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

export const redeemInviteItem: EventoHandler<Request, ReqRedeemInvite, ResRedeemInvite> = {
  hash: "redeem-invite",
  validate: (ctx) => validateRedeemInvite(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqRedeemInvite>, ResRedeemInvite>,
    ): Promise<Result<EventoResultType>> => {
      const res = await redeemInvite(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};
