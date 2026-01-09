import { Result } from "@adviser/cement";
import { ReqInviteUser, InviteTicket, InvitedParams } from "@fireproof/core-types-protocols-dashboard";
import { and, eq, gt } from "drizzle-orm";
import { sqlInviteTickets, sqlToInviteTickets, prepareInviteTicket } from "../sql/invites.js";
import { sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { findInvite } from "./find-invite.js";

export async function createInviteTicket(
  ctx: FPApiSQLCtx,
  userId: string,
  tenantId: string,
  ledgerId: string | undefined,
  req: ReqWithVerifiedAuthUser<ReqInviteUser>,
): Promise<Result<InviteTicket>> {
  // check maxInvites
  const allowed = await ctx.db
    .select()
    .from(sqlTenants)
    .where(
      and(
        eq(sqlTenants.tenantId, tenantId),
        gt(sqlTenants.maxInvites, ctx.db.$count(sqlInviteTickets, eq(sqlInviteTickets.invitedTenantId, tenantId))),
      ),
    )
    .get();
  if (!allowed) {
    return Result.Err("max invites reached");
  }

  const found = await findInvite(ctx, { query: req.ticket.query, tenantId, ledgerId });
  if (found.length) {
    return Result.Err("invite already exists");
  }

  let ivp: InvitedParams = {};
  if (req.ticket.invitedParams?.ledger) {
    ivp = {
      ledger: {
        id: req.ticket.invitedParams?.ledger.id,
        role: req.ticket.invitedParams?.ledger.role ?? "member",
        right: req.ticket.invitedParams?.ledger.right ?? "read",
      },
    };
  }
  if (req.ticket.invitedParams?.tenant) {
    ivp = {
      tenant: {
        id: req.ticket.invitedParams?.tenant.id,
        role: req.ticket.invitedParams?.tenant.role ?? "member",
      },
    };
  }

  return Result.Ok(
    sqlToInviteTickets(
      await ctx.db
        .insert(sqlInviteTickets)
        .values(
          prepareInviteTicket({
            sthis: ctx.sthis,
            userId,
            invitedTicketParams: {
              query: req.ticket.query,
              status: "pending",
              invitedParams: ivp,
            },
          }),
        )
        .returning(),
    )[0],
  );
}
