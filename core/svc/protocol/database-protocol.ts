import { z } from "zod";
import { DatabaseConfigWithNameSchema } from "@fireproof/core-types-base";
import { makePartial } from "@fireproof/core-runtime";
import {
  ReqDBGetSchema,
  ResDBGetSchema,
  ReqDBGetFileContentSchema,
  ResDBGetFileContentSchema,
} from "./database-protocol-get.zod.js";
import { ReqDBBulkSchema, ResDBBulkSchema } from "./database-protocol-bulk.zod.js";

import { ErrorMsgSchema, MsgBaseSchemaBase } from "./base.zod.js";

export const ReqApplyDatabaseConfigSchema = MsgBaseSchemaBase.extend({
  type: z.literal("reqApplyDatabaseConfig"),
  config: makePartial(DatabaseConfigWithNameSchema),
}).readonly();

export type ReqApplyDatabaseConfig = z.infer<typeof ReqApplyDatabaseConfigSchema>;

export const ResApplyDatabaseConfigSchema = MsgBaseSchemaBase.extend({
  type: z.literal("resApplyDatabaseConfig"),
  dbName: z.string(),
  dbId: z.string(), // typically ledger refId hash of the given config
}).readonly();

export type ResApplyDatabaseConfig = z.infer<typeof ResApplyDatabaseConfigSchema>;

export function isResApplyDatabaseConfig(msg: MsgType): msg is ResApplyDatabaseConfig {
  return msg.type === "resApplyDatabaseConfig";
}

export function isResDBGet(msg: MsgType): msg is z.infer<typeof ResDBGetSchema> {
  return msg.type === "resDBGet";
}

export const MsgTypeSchema = z.union([
  ReqApplyDatabaseConfigSchema,
  ResApplyDatabaseConfigSchema,
  ErrorMsgSchema,
  ReqDBGetSchema,
  ResDBGetSchema,
  ReqDBGetFileContentSchema,
  ResDBGetFileContentSchema,
  ReqDBBulkSchema,
  ResDBBulkSchema,
]);

export type MsgType = z.infer<typeof MsgTypeSchema>;

export type DBSend<Req extends MsgType> = Omit<Req, "tid" | "src"> &
  Partial<{
    readonly tid: string;
    readonly src: string;
  }>;

// export interface Database extends ReadyCloseDestroy, HasLogger, HasSuperThis {
//   // readonly name: string;
//   readonly ledger: Ledger;
//   readonly logger: Logger;
//   readonly sthis: SuperThis;
//   // readonly id: string;
//   readonly name: string;

//   onClosed(fn: () => void): void;

//   attach(a: Attachable): Promise<Attached>;

//   get<T extends DocTypes>(id: string): Promise<DocWithId<T>>;
//   put<T extends DocTypes>(doc: DocSet<T>): Promise<DocResponse>;
//   bulk<T extends DocTypes>(docs: DocSet<T>[]): Promise<BulkResponse>;
//   del(id: string): Promise<DocResponse>;
//   remove(id: string): Promise<DocResponse>;
//   changes<T extends DocTypes>(since?: ClockHead, opts?: ChangesOptions): Promise<ChangesResponse<T>>;

//   allDocs<T extends DocTypes>(opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>>;

//   allDocuments<T extends DocTypes>(opts?: Partial<AllDocsQueryOpts>): Promise<AllDocsResponse<T>>;

//   subscribe<T extends DocTypes>(listener: ListenerFn<T>, updates?: boolean): () => void;

//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts: Partial<QueryOptsWithoutDocs<K>>): Promise<IndexRowsWithoutDocs<T, K, R>>;
//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts: Partial<QueryOptsWithDocs<K>>): Promise<IndexRowsWithDocs<T, K, R>>;
//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts?: Partial<QueryOptsWithUndefDocs<K>>): Promise<IndexRowsWithDocs<T, K, R>>;

//   query<
//     T extends DocTypes,
//     K extends IndexKeyType = string,
//     R extends DocFragment = T,
//     O extends Partial<QueryOpts<K>> = Partial<QueryOpts<K>>,
//   >(
//     field: string | MapFn<T>,
//     opts?: O,
//   ): Promise<QueryResult<T, K, R, O>>;

//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts?: undefined): Promise<IndexRowsWithDocs<T, K, R>>;
//   // query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(field: string | MapFn<T>, opts?: Partial<QueryOpts<K>>): Promise<IndexRows<T, K, R>>;
//   compact(): Promise<void>;
// }
