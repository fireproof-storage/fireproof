import { Result } from "@adviser/cement";
import { ReqInviteUser, ResInviteUser, InviteTicket } from "@fireproof/core-protocols-dashboard";
import { eq } from "drizzle-orm";
import { sqlLedgers } from "../sql/ledgers.js";
import { sqlTenants } from "../sql/tenants.js";
import { UserNotFoundError, queryUser } from "../sql/users.js";
import { FPApiSQLCtx, isVerifiedUserActive, ReqWithVerifiedAuthUser } from "../types.js";
import { createInviteTicket } from "../internal/create-invite-ticket.js";
import { updateInviteTicket } from "../internal/update-invite.ticket.js";

export async function inviteUser(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqInviteUser>): Promise<Result<ResInviteUser>> {
  console.log(
    "[inviteUser p0.48] starting with request:",
    JSON.stringify({
      query: req.ticket.query,
      invitedParams: req.ticket.invitedParams,
      inviteId: req.ticket.inviteId,
    }),
  );
  if (!isVerifiedUserActive(req.auth)) {
    console.log("[inviteUser p0.48] user not active");
    return Result.Err(new UserNotFoundError());
  }
  const findUser = await queryUser(ctx.db, req.ticket.query);
  if (findUser.isErr()) {
    console.log("[inviteUser p0.48] queryUser failed:", findUser.Err());
    return Result.Err(findUser.Err());
  }
  console.log("[inviteUser p0.48] queryUser found:", findUser.Ok().length, "users");
  if (req.ticket.query.existingUserId && findUser.Ok().length !== 1) {
    console.log("[inviteUser p0.48] existingUserId not found");
    return Result.Err("existingUserId not found");
  }
  if (req.ticket.query.existingUserId === req.auth.user.userId) {
    console.log("[inviteUser p0.48] cannot invite self");
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
    console.log("[inviteUser p0.48] looking for ledger:", req.ticket.invitedParams.ledger.id);
    const ledger = await ctx.db.select().from(sqlLedgers).where(eq(sqlLedgers.ledgerId, req.ticket.invitedParams.ledger.id)).get();
    if (!ledger) {
      console.log("[inviteUser p0.48] ledger not found");
      return Result.Err("ledger not found");
    }
    ledgerId = ledger.ledgerId;
    tenantId = ledger.tenantId;
    console.log("[inviteUser p0.48] found ledger:", ledgerId, "tenantId:", tenantId);
  }
  if (req.ticket.invitedParams?.tenant) {
    console.log("[inviteUser p0.48] looking for tenant:", req.ticket.invitedParams.tenant.id);
    const tenant = await ctx.db.select().from(sqlTenants).where(eq(sqlTenants.tenantId, req.ticket.invitedParams.tenant.id)).get();
    if (!tenant) {
      console.log("[inviteUser p0.48] tenant not found");
      return Result.Err("tenant not found");
    }
    tenantId = tenant.tenantId;
    console.log("[inviteUser p0.48] found tenant:", tenantId);
  }
  if (!tenantId) {
    console.log("[inviteUser p0.48] no tenant found");
    return Result.Err("tenant not found");
  }

  let inviteTicket: InviteTicket;
  if (!req.ticket.inviteId) {
    console.log("[inviteUser p0.48] creating new invite for tenantId:", tenantId, "ledgerId:", ledgerId);
    const rInviteTicket = await createInviteTicket(ctx, req.auth.user.userId, tenantId, ledgerId, req);
    if (rInviteTicket.isErr()) {
      console.log("[inviteUser p0.48] createInviteTicket failed:", rInviteTicket.Err());
      return Result.Err(rInviteTicket.Err());
    }
    inviteTicket = rInviteTicket.Ok();
    console.log(
      "[inviteUser p0.48] created invite:",
      JSON.stringify({
        inviteId: inviteTicket.inviteId,
        ledgerId: inviteTicket.invitedParams.ledger?.id,
        tenantId: inviteTicket.invitedParams.tenant?.id,
        queryEmail: inviteTicket.query.byEmail,
      }),
    );
  } else {
    console.log("[inviteUser p0.48] updating invite:", req.ticket.inviteId);
    const rInviteTicket = await updateInviteTicket(ctx, req.auth.user.userId, tenantId, ledgerId, req);
    if (rInviteTicket.isErr()) {
      console.log("[inviteUser p0.48] updateInviteTicket failed:", rInviteTicket.Err());
      return Result.Err(rInviteTicket.Err());
    }
    inviteTicket = rInviteTicket.Ok();
    console.log("[inviteUser p0.48] updated invite:", inviteTicket.inviteId);
  }
  console.log("[inviteUser p0.48] success, returning invite:", inviteTicket.inviteId);
  return Result.Ok({
    type: "resInviteUser",
    invite: inviteTicket,
  });
}
