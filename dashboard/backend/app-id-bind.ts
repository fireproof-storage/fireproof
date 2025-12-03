import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqlLedgers } from "./ledgers.js";
import { sqlTenants } from "./db-api-schema.js";

export const sqlAppIdBinding = sqliteTable(
  "AppIdBinding",
  {
    appId: text().notNull(),
    env: text().notNull(),
    ledgerId: text()
      .notNull()
      .references(() => sqlLedgers.ledgerId),
    tenantId: text()
      .notNull()
      .references(() => sqlTenants.tenantId),
    createdAt: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.appId, table.env] })],
);
