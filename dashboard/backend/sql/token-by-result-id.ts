import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export type ResultState = "waiting" | "set" | "got";

export const sqlTokenByResultId = sqliteTable("TokenByResultId", {
  resultId: text().primaryKey(),
  status: text().notNull(), // pending | accepted | rejected | expired
  token: text(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});
