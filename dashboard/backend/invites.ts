import { stripper } from "@adviser/cement/utils";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sqlUsers } from "./users.ts";
import { sqlTenants } from "./tenants.ts";
import { sqlLedgers } from "./ledgers.ts";
import { AuthProvider, queryEmail, queryNick, QueryUser, toUndef } from "./sql-helper.ts";
import { SuperThis } from "@fireproof/core";

export type InviteTicketStatus = "pending" | "accepted" | "rejected" | "expired";

export const sqlInviteTickets = sqliteTable(
  "InviteTickets",
  {
    inviteId: text().primaryKey(),

    inviterUserId: text()
      .notNull()
      .references(() => sqlUsers.userId),
    // inviterTenantId: text()
    //   .notNull()
    //   .references(() => sqlTenants.tenantId),

    status: text().notNull(), // pending | accepted | rejected | expired
    statusReason: text().notNull().default("just invited"),
    // pending | accepted | rejected | expired

    // set if accepted
    invitedUserId: text().references(() => sqlUsers.userId),

    // bind on login Invite
    queryProvider: text(),
    // email key for QueryUser -> tolower - remove + and .
    queryEmail: text(),
    // nick key for QueryUser -> tolower
    queryNick: text(),

    sendEmailCount: int().notNull(),

    // invite to tenant
    invitedTenantId: text().references(() => sqlTenants.tenantId),
    // invite to ledger
    invitedLedgerId: text().references(() => sqlLedgers.ledgerId),
    // depending on target a JSON with e.g. the role and right
    invitedParams: text().notNull(),

    expiresAfter: text().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    index("invitesEmail").on(table.queryEmail),
    index("invitesNick").on(table.queryNick),
    index("invitesExpiresAfter").on(table.expiresAfter),
  ],
);

export interface SqlInvitedParams {
  readonly tenant?: {
    readonly role: "admin" | "member";
  };
  readonly ledger?: {
    readonly role: "admin" | "member";
    readonly right: "read" | "write";
  };
}

export interface InvitedParams {
  readonly tenant?: SqlInvitedParams["tenant"] & { readonly id: string };
  readonly ledger?: SqlInvitedParams["ledger"] & { readonly id: string };
}

export interface InviteTicket {
  readonly inviteId: string;
  readonly sendEmailCount: number;
  readonly inviterUserId: string;

  readonly query: QueryUser;
  // readonly userID?: string;
  // readonly queryProvider?: AuthProvider;
  // readonly queryEmail?: string;
  // readonly queryNick?: string;

  readonly status: InviteTicketStatus;
  readonly statusReason: string;
  readonly invitedUserId?: string;
  readonly invitedParams: InvitedParams;

  readonly expiresAfter: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function sqlToInviteTickets(sqls: (typeof sqlInviteTickets.$inferSelect)[]): InviteTicket[] {
  return sqls.map((sql) => {
    const ivp = JSON.parse(sql.invitedParams) ?? ({} as SqlInvitedParams);
    if (ivp.tenant) {
      ivp.tenant = { ...ivp.tenant, id: sql.invitedTenantId };
    }
    if (ivp.ledger) {
      ivp.ledger = { ...ivp.ledger, id: sql.invitedLedgerId };
    }
    const objInvitedUserId: { invitedUserId?: string } = {};
    if (sql.invitedUserId) {
      objInvitedUserId.invitedUserId = sql.invitedUserId;
    }
    return {
      inviteId: sql.inviteId,
      sendEmailCount: sql.sendEmailCount,
      inviterUserId: sql.inviterUserId,
      ...objInvitedUserId,
      query: {
        existingUserId: toUndef(sql.invitedUserId),
        byEmail: toUndef(sql.queryEmail),
        byNick: toUndef(sql.queryNick),
        andProvider: toUndef(sql.queryProvider) as AuthProvider,
      },
      invitedParams: ivp,
      status: sql.status as InviteTicketStatus,
      statusReason: sql.statusReason,
      expiresAfter: new Date(sql.expiresAfter),
      createdAt: new Date(sql.createdAt),
      updatedAt: new Date(sql.updatedAt),
    };
  });
}

export interface InviteTicketParams {
  // readonly auth: AuthType;
  readonly query: QueryUser;
  // to update
  readonly inviteId?: string;
  readonly status: InviteTicketStatus;
  readonly invitedUserId?: string; // must set if status is not pending
  readonly incSendEmailCount?: boolean;
  readonly invitedParams: InvitedParams;
}

export interface PrepareInviteTicketParams {
  readonly sthis: SuperThis;
  readonly userId: string;
  readonly invitedTicketParams: InviteTicketParams;
  readonly expiresAfter?: Date;
  readonly now?: Date;
}

export function prepareInviteTicket({
  sthis,
  userId,
  invitedTicketParams: { inviteId, status, query, invitedParams: ivp, invitedUserId },
  now,
  expiresAfter,
}: PrepareInviteTicketParams): typeof sqlInviteTickets.$inferInsert {
  const nowDate = new Date();
  const nowStr = (now ?? nowDate).toISOString();
  const expiresAfterStr = (expiresAfter ?? new Date(nowDate.getTime() + 1000 * 60 * 60 * 24 * 7)).toISOString();

  if ((ivp.ledger && ivp.tenant) || (!ivp.ledger && !ivp.tenant)) {
    throw new Error("only one target ledger or tenant allowed");
  }
  let sqlLedgerId: string | undefined = undefined;
  let sqlTenantId: string | undefined = undefined;
  let sqlInvitedParams: SqlInvitedParams | undefined = undefined;
  if (ivp.ledger) {
    sqlLedgerId = ivp.ledger.id;
    sqlInvitedParams = { ledger: stripper("id", ivp.ledger) as SqlInvitedParams["ledger"] };
  }
  if (ivp.tenant) {
    sqlTenantId = ivp.tenant.id;
    sqlInvitedParams = { tenant: stripper("id", ivp.tenant) as SqlInvitedParams["tenant"] };
  }
  // let target: "tenant" | "ledger" = "tenant";
  const objInvitedUserId: { invitedUserId?: string } = {};
  if (status !== "pending") {
    if (invitedUserId) {
      objInvitedUserId.invitedUserId = invitedUserId;
    } else {
      throw new Error("invitedUserId required if status is not pending");
    }
  } else {
    if (query.existingUserId) {
      objInvitedUserId.invitedUserId = query.existingUserId;
    }
  }
  return {
    inviteId: inviteId ?? sthis.nextId(12).str,
    inviterUserId: userId,
    status: status || "pending",
    // inviterTenantId: tenantId,
    queryEmail: queryEmail(query.byEmail),
    queryNick: queryNick(query.byNick),
    queryProvider: query.andProvider,
    ...objInvitedUserId,
    sendEmailCount: 0,
    invitedTenantId: sqlTenantId,
    invitedLedgerId: sqlLedgerId,
    invitedParams: JSON.stringify(sqlInvitedParams),
    expiresAfter: expiresAfterStr,
    createdAt: nowStr,
    updatedAt: nowStr,
  };
}
