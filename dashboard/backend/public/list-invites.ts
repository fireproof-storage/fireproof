import { Result } from "@adviser/cement";
import { ReqListInvites, ResListInvites } from "@fireproof/core-protocols-dashboard";
import { and, eq, inArray, or } from "drizzle-orm";
import { sqlInviteTickets, sqlToInviteTickets } from "../sql/invites.js";
import { sqlLedgerUsers, sqlLedgers } from "../sql/ledgers.js";
import { sqlTenantUsers, sqlTenants } from "../sql/tenants.js";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { getRoles } from "../internal/get-roles.js";

/**
 *
 * @description list invites for a user if user is owner of tenant or admin of tenant
 */
export async function listInvites(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqListInvites>): Promise<Result<ResListInvites>> {
  let tenantCond = and(eq(sqlTenantUsers.userId, req.auth.user.userId), eq(sqlTenantUsers.status, "active"));
  if (req.tenantIds?.length) {
    tenantCond = and(inArray(sqlTenantUsers.tenantId, req.tenantIds), tenantCond);
  }
  const tenants = await ctx.db
    .select()
    .from(sqlTenantUsers)
    .innerJoin(sqlTenants, and(eq(sqlTenants.tenantId, sqlTenantUsers.tenantId), eq(sqlTenants.status, "active")))
    .where(tenantCond)
    .all();

  let ledgerCond = and(eq(sqlLedgerUsers.userId, req.auth.user.userId), eq(sqlLedgerUsers.status, "active"));
  if (req.ledgerIds?.length) {
    ledgerCond = and(inArray(sqlLedgerUsers.ledgerId, req.ledgerIds), ledgerCond);
  }
  const ledgers = await ctx.db
    .select()
    .from(sqlLedgerUsers)
    .innerJoin(sqlLedgers, and(eq(sqlLedgers.ledgerId, sqlLedgerUsers.ledgerId), eq(sqlLedgers.status, "active")))
    .where(ledgerCond)
    .all();

  if (!tenants.length && !ledgers.length) {
    return Result.Ok({
      type: "resListInvites",
      tickets: [],
    });
  }

  const roles = await getRoles(
    ctx,
    req.auth.user.userId,
    tenants.map((i) => i.Tenants),
    ledgers.map((i) => i.Ledgers),
  );
  // list invites from all tenants where i'm owner or admin
  const invites = await ctx.db
    .select()
    .from(sqlInviteTickets)
    .where(
      or(
        inArray(
          sqlInviteTickets.invitedTenantId,
          roles
            .filter((i) => i.role === "admin" && i.tenantId)
            .map((i) => i.tenantId as string)
            .flat(2),
        ),
        inArray(
          sqlInviteTickets.invitedLedgerId,
          roles
            .filter((i) => i.role === "admin" && i.ledgerId)
            .map((i) => i.ledgerId as string)
            .flat(2),
        ),
      ),
    );
  return Result.Ok({
    type: "resListInvites",
    tickets: sqlToInviteTickets(invites),
  });

  // list invites from all ledgers where i'm owner or admin

  // this.db.select()
  //   .from(sqlTenants)
  //   .innerJoin(sqlTenantUsers, and(
  //       eq(sqlTenantUsers.userId, auth.user.userId),
  //       eq(sqlTenants.tenantId, sqlTenantUsers.tenantId),
  //     ))
  //   .innerJoin(sqlTenantUserRoles, and(
  //     eq(sqlTenantUsers.userId, auth.user.userId),
  //     eq(sqlTenants.tenantId, sqlTenantUsers.tenantId)
  //   ))
  //   .where(
  //     eq(sqlTenants.ownerUserId, auth.user.userId)
  // ).all();

  // this.db.select().from(sqlInviteTickets)
  //   .where(
  //     eq(sqlInviteTickets.inviterUserId, auth.user.userId)
  //   )
  //   .all();

  // let rows: (typeof sqlInviteTickets.$inferSelect)[];
  // const ownerTenants = await this.db
  //   .select()
  //   .from(sqlTenants)
  //   .where(eq(sqlTenants.ownerUserId, auth.user.userId))
  //   .all()
  //   .then((rows) => rows.map((row) => row.tenantId));
  // // get admin in tenant for this user
  // let condition = and(eq(sqlTenantUserRoles.userId, auth.user.userId), eq(sqlTenantUserRoles.role, "admin"));
  // if (req.tenantIds.length) {
  //   // filter by tenantIds if set
  //   condition = and(inArray(sqlTenantUserRoles.tenantId, req.tenantIds), condition);
  // }
  // const adminTenants = await this.db
  //   .select()
  //   .from(sqlTenantUserRoles)
  //   .where(condition)
  //   .all()
  //   .then((rows) => rows.map((row) => row.tenantId));
  // const setTenants = new Set(req.tenantIds);
  // const filterAdminTenants = Array.from(new Set([...ownerTenants, ...adminTenants, ...req.tenantIds])).filter((x) => {
  //   return setTenants.size ? setTenants.has(x) : true;
  // });
  // // console.log(">>>>", filterAdminTenants);
  // rows = await this.db
  //   .select()
  //   .from(sqlInviteTickets)
  //   .where(
  //     and(
  //       inArray(sqlInviteTickets.invitedTenantId, filterAdminTenants),
  //       // inArray(inviteTickets.inv, req.tenantIds)
  //     ),
  //   )
  //   .all();
  // // }
  // return Result.Ok({
  //   type: "resListInvites",
  //   tickets: Array.from(
  //     rows
  //       .reduce((acc, row) => {
  //         if (!row.inviterTenantId) {
  //           throw new Error("inviterTenantId is required");
  //         }
  //         const invites = acc.get(row.inviterTenantId) ?? [];
  //         invites.push(sqlToInvite(row));
  //         acc.set(row.inviterTenantId, invites);
  //         return acc;
  //       }, new Map<string, InviteTicket[]>())
  //       .entries(),
  //   )
  //     .map(([tenantId, invites]) => ({
  //       tenantId,
  //       invites,
  //     }))
  //     .filter((x) => x.invites.length),
  // });
}
