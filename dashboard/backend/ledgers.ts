import { int, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants.ts";
import { users } from "./users.ts";

export const ledgers = sqliteTable("Ledgers", {
  ledgerId: text().primaryKey(),
  tenantId: text()
    .notNull()
    .references(() => tenants.tenantId),
  name: text().notNull(),
  maxShares: int().notNull().default(5),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const ledgerUserRefRoles = sqliteTable(
  "LedgerUserRefs",
  {
    ledgerId: text().references(() => ledgers.ledgerId),
    userRefId: text().references(() => users.userId),
    role: text().notNull(), // "admin" | "member"
    right: text().notNull(), // "read" | "write"
    createdAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ledgerId, table.userRefId, table.role] }),
    index("lurrUserRefIdx").on(table.userRefId), // to enable delete by userRefId
  ],
);
