import { int, sqliteTable, text, primaryKey, index, unique } from "drizzle-orm/sqlite-core";
import { sqlTenants } from "./tenants.ts";
import { sqlUsers } from "./users.ts";
import { toUndef } from "./sql-helper.ts";

export const sqlLedgers = sqliteTable(
  "Ledgers",
  {
    ledgerId: text().primaryKey(),
    tenantId: text()
      .notNull()
      .references(() => sqlTenants.tenantId),
    ownerId: text()
      .notNull()
      .references(() => sqlUsers.userId),
    name: text().notNull(),
    status: text().notNull().default("active"),
    statusReason: text().notNull().default("just created"),
    maxShares: int().notNull().default(5),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [unique("ledgerNamespace").on(table.tenantId, table.name)],
);

interface LedgerUserRight {
  readonly userId: string;
  readonly role: "admin" | "member";
  readonly right: "read" | "write";
  readonly name?: string;
  readonly default: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LedgerUser {
  readonly ledgerId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly ownerId: string;
  readonly maxShares: number;
  readonly users: LedgerUserRight[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function sqlToLedgers(
  rows: {
    Ledgers: typeof sqlLedgers.$inferSelect;
    LedgerUsers: typeof sqlLedgerUsers.$inferSelect;
  }[],
): LedgerUser[] {
  return Array.from(
    rows
      .reduce((acc, { Ledgers: l, LedgerUsers: lur }) => {
        let ledger = acc.get(l.ledgerId);
        if (!ledger) {
          ledger = {
            ledgerId: l.ledgerId,
            tenantId: l.tenantId,
            name: l.name,
            ownerId: l.ownerId,
            maxShares: l.maxShares,
            users: [],
            createdAt: new Date(l.createdAt),
            updatedAt: new Date(l.updatedAt),
          };
          acc.set(l.ledgerId, ledger);
        }
        ledger.users.push({
          userId: lur.userId,
          role: lur.role as "admin" | "member",
          right: lur.right as "read" | "write",
          name: toUndef(lur.name),
          default: !!lur.default,
          createdAt: new Date(lur.createdAt),
          updatedAt: new Date(lur.updatedAt),
        });
        return acc;
      }, new Map<string, LedgerUser>())
      .values(),
  );
}

export const sqlLedgerUsers = sqliteTable(
  "LedgerUsers",
  {
    ledgerId: text()
      .notNull()
      .references(() => sqlLedgers.ledgerId),
    userId: text()
      .notNull()
      .references(() => sqlUsers.userId),
    role: text().notNull(), // "admin" | "member"
    right: text().notNull(), // "read" | "write"
    default: int().notNull(),
    status: text().notNull().default("active"),
    statusReason: text().notNull().default("just created"),
    name: text(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ledgerId, table.userId, table.role] }),
    index("luUserIdx").on(table.userId), // to enable delete by userRefId
  ],
);
