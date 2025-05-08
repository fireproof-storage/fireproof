import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export type ResultState = "waiting" | "set" | "got";

export const sqlTokenByResultId = sqliteTable("TokenByResultId", {
  resultId: text().primaryKey(),
  status: text().notNull(), // pending | accepted | rejected | expired
  token: text(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

// export interface SqlTokenByResultIdParams {
//   readonly token: string;
// }

// export interface TokenByResultIdParams {
//   readonly token: string;
// }

// export interface TokenByResultId {
//   readonly resultId: string;
//   readonly status: ResultState;
//   readonly token?: string;
//   readonly createdAt: Date;
//   readonly updatedAt: Date;
// }

// export function sqlToTokenByResultId(sqls: (typeof sqlTokenByResultId.$inferSelect)[]): TokenByResultId[] {
//   return sqls.map((sql) => ({
//     resultId: sql.resultId,
//     status: sql.status as ResultState,
//     token: sql.token ? sql.token : undefined,
//     createdAt: new Date(sql.createdAt),
//     updatedAt: new Date(sql.updatedAt),
//   }));
// }

// export interface InviteTicketParams {
//   // readonly auth: AuthType;
//   readonly query: QueryUser;
//   // to update
//   readonly inviteId?: string;
//   readonly status: InviteTicketStatus;
//   readonly invitedUserId?: string; // must set if status is not pending
//   readonly incSendEmailCount?: boolean;
//   readonly invitedParams: InvitedParams;
// }

// export interface PrepareTokenByResultId {
//   // readonly sthis: SuperThis;
//   readonly resultId: string;
//   readonly status: ResultState;
//   readonly token?: string;
//   readonly now?: Date;
// }

// export function prepareTokenByResultId({
//   resultId,
//   status,
//   token,
//   now,
// }: PrepareTokenByResultId): typeof sqlTokenByResultId.$inferInsert {
//   const nowDate = new Date();
//   const nowStr = (now ?? nowDate).toISOString();
//   return {
//     resultId,
//     status,
//     token,
//     createdAt: nowStr,
//     updatedAt: nowStr,
//   };
// }
