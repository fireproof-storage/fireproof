import { Result } from "@adviser/cement";
import { ReqInviteUser, ResInviteUser, InviteTicket } from "@fireproof/core-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlLedgers } from "../sql/ledgers.js";
import { sqlTenants } from "../sql/tenants.js";
import { UserNotFoundError, queryUser } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";
import { createInviteTicket } from "../internal/create-invite-ticket.js";
import { updateInviteTicket } from "../internal/update-invite.ticket.js";

export async function inviteUser(ctx: FPApiSQLCtx, req: ReqInviteUser): Promise<Result<ResInviteUser>> {
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }
  const findUser = await queryUser(ctx.db, req.ticket.query);
  if (findUser.isErr()) {
    return Result.Err(findUser.Err());
  }
  if (req.ticket.query.existingUserId && findUser.Ok().length !== 1) {
    return Result.Err("existingUserId not found");
  }
  if (req.ticket.query.existingUserId === auth.user.userId) {
    return Result.Err("cannot invite self");
  }

  if (
    req.ticket.invitedParams?.ledger &&
    req.ticket.invitedParams?.tenant &&
    !req.ticket.invitedParams?.ledger &&
    !req.ticket.invitedParams?.tenant
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
    const rInviteTicket = await createInviteTicket(ctx, auth.user.userId, tenantId, ledgerId, req);
    if (rInviteTicket.isErr()) {
      return Result.Err(rInviteTicket.Err());
    }
    inviteTicket = rInviteTicket.Ok();
  } else {
    const rInviteTicket = await updateInviteTicket(ctx, auth.user.userId, tenantId, ledgerId, req);
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
