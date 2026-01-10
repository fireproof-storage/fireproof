import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqInviteUser, ResInviteUser, InviteTicket, validateInviteUser } from "@fireproof/core-types-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlLedgers } from "../sql/ledgers.js";
import { sqlTenants } from "../sql/tenants.js";
import { queryUser } from "../sql/users.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { createInviteTicket } from "../internal/create-invite-ticket.js";
import { updateInviteTicket } from "../internal/update-invite.ticket.js";
import { checkAuth, wrapStop } from "../utils/index.js";

async function inviteUser(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqInviteUser>): Promise<Result<ResInviteUser>> {
  const findUser = await queryUser(ctx.db, req.ticket.query);
  if (findUser.isErr()) {
    return Result.Err(findUser.Err());
  }
  if (req.ticket.query.existingUserId && findUser.Ok().length !== 1) {
    return Result.Err("existingUserId not found");
  }
  if (req.ticket.query.existingUserId === req.auth.user.userId) {
    return Result.Err("cannot invite self");
  }

  if (
    (req.ticket.invitedParams?.ledger && req.ticket.invitedParams?.tenant) ||
    (!req.ticket.invitedParams?.ledger && !req.ticket.invitedParams?.tenant)
  ) {
    return Result.Err("either ledger or tenant must be set");
  }
  let tenantId: string | undefined;
  let ledgerId: string | undefined;
  if (req.ticket.invitedParams?.ledger) {
    const ledger = await ctx.db.select().from(sqlLedgers).where(eq(sqlLedgers.ledgerId, req.ticket.invitedParams.ledger.id)).get();
    if (!ledger) {
      return Result.Err("ledger not found");
    }
    ledgerId = ledger.ledgerId;
    tenantId = ledger.tenantId;
  }
  if (req.ticket.invitedParams?.tenant) {
    const tenant = await ctx.db.select().from(sqlTenants).where(eq(sqlTenants.tenantId, req.ticket.invitedParams.tenant.id)).get();
    if (!tenant) {
      return Result.Err("tenant not found");
    }
    tenantId = tenant.tenantId;
  }
  if (!tenantId) {
    return Result.Err("tenant not found");
  }

  let inviteTicket: InviteTicket;
  if (!req.ticket.inviteId) {
    const rInviteTicket = await createInviteTicket(ctx, req.auth.user.userId, tenantId, ledgerId, req);
    if (rInviteTicket.isErr()) {
      return Result.Err(rInviteTicket.Err());
    }
    inviteTicket = rInviteTicket.Ok();
  } else {
    const rInviteTicket = await updateInviteTicket(ctx, req.auth.user.userId, tenantId, ledgerId, req);
    if (rInviteTicket.isErr()) {
      return Result.Err(rInviteTicket.Err());
    }
    inviteTicket = rInviteTicket.Ok();
  }
  return Result.Ok({
    type: "resInviteUser",
    invite: inviteTicket,
  });
}

export const inviteUserItem: EventoHandler<Request, ReqInviteUser, ResInviteUser> = {
  hash: "invite-user",
  validate: (ctx) => validateInviteUser(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqInviteUser>, ResInviteUser>,
    ): Promise<Result<EventoResultType>> => {
      const res = await inviteUser(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};
