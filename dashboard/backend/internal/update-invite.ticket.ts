import { Result } from "@adviser/cement";
import { ReqInviteUser, InviteTicket, InvitedParams } from "@fireproof/core-types-protocols-dashboard";
import { eq } from "drizzle-orm";
import { prepareInviteTicket, sqlToInviteTickets, sqlInviteTickets } from "../sql/invites.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { findInvite } from "./find-invite.js";

export async function updateInviteTicket(
  ctx: FPApiSQLCtx,
  userId: string,
  tenantId: string,
  ledgerId: string | undefined,
  req: ReqWithVerifiedAuthUser<ReqInviteUser>,
): Promise<Result<InviteTicket>> {
  const found = await findInvite(ctx, { inviteId: req.ticket.inviteId });
  if (!found.length) {
    return Result.Err("invite not found");
  }
  const invite = found[0];
  if (invite.status !== "pending") {
    return Result.Err("invite not pending");
  }
  let ivp: InvitedParams = {};
  if (req.ticket.invitedParams?.ledger) {
    ivp = {
      ledger: {
        ...invite.invitedParams.ledger,
        ...req.ticket.invitedParams.ledger,
      },
    };
  }
  if (req.ticket.invitedParams?.tenant) {
    ivp = {
      tenant: {
        ...invite.invitedParams.tenant,
        ...req.ticket.invitedParams.tenant,
      },
    };
  }
  const toInsert = prepareInviteTicket({
    sthis: ctx.sthis,
    userId: userId,
    invitedTicketParams: {
      query: req.ticket.query,
      status: "pending",
      invitedParams: ivp,
    },
  });
  // might be update query
  return Result.Ok(
    sqlToInviteTickets(
      await ctx.db
        .update(sqlInviteTickets)
        .set({
          sendEmailCount: req.ticket.incSendEmailCount ? invite.sendEmailCount + 1 : invite.sendEmailCount,
          invitedParams: toInsert.invitedParams,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sqlInviteTickets.inviteId, invite.inviteId))
        .returning(),
    )[0],
  );
}
