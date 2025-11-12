import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const sqlBoundLocalDbnames = sqliteTable(
  "BoundLocalDbnames",
  {
    appId: text().notNull(),
    localDbName: text().notNull(),
    tenantId: text().notNull(),
    ledgerId: text().notNull(),
    deviceIds: text().notNull(), // JSON stringified array of device IDs
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.appId, table.localDbName] })],
);
