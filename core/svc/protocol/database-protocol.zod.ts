import { z } from "zod";
import { ProxyDocFileMetaSchema, ProxyDocWithId, ProxyDocWithIdSchema } from "./doc-base.zod.js";
import { DatabaseConfigWithNameSchema } from "@fireproof/core-types-base";

export const MsgBaseSchemaBase = z.object({
  tid: z.string(),
  type: z.string(),
  src: z.string(),
  dst: z.string(),
});

export const MsgBaseSchema = MsgBaseSchemaBase.readonly();

export type MsgBase = z.infer<typeof MsgBaseSchema>;

export const ErrorMsgSchema = MsgBaseSchemaBase.extend({
  type: z.literal("error"),
  error: z.string(),
  code: z.number().optional(),
  stack: z.array(z.string()).optional(),
}).readonly();

export type ErrorMsg = z.infer<typeof ErrorMsgSchema>;

/**
 * Base schema for database instance messages
 */
export const DbInstanceSchemaBase = MsgBaseSchemaBase.extend({
  dbName: z.string(),
  dbId: z.string(),
});

export const DbInstanceSchema = DbInstanceSchemaBase.readonly();

export type DbInstance = z.infer<typeof DbInstanceSchema>;

/**
 * Request to get a document by ID
 */
export const ReqDBGetSchema = DbInstanceSchemaBase.extend({
  type: z.literal("reqDBGet"),
  docIds: z.array(z.string()),
}).readonly();

export type ReqDBGet = z.infer<typeof ReqDBGetSchema>;

export function isResDBGet(msg: MsgType): msg is ResDBGet {
  return msg.type === "resDBGet";
}

/**
 * Response with document data
 * Note: Uses z.any() for result since we don't know T at schema definition time
 */
export const ResDBGetSchema = DbInstanceSchemaBase.extend({
  type: z.literal("resDBGet"),
  docId: z.string(),
  results: ProxyDocWithIdSchema.array(),
}).readonly();

export type ResDBGet<T = unknown> = z.infer<typeof ResDBGetSchema> & {
  results: ProxyDocWithId<T>[];
};

/**
 * Request to get file content from a document
 */
export const ReqDBGetFileContentSchema = DbInstanceSchemaBase.extend({
  type: z.literal("reqDBGetFile"),
  docId: z.string(),
  fileData: ProxyDocFileMetaSchema,
}).readonly();

export type ReqDBGetFileContent = z.infer<typeof ReqDBGetFileContentSchema>;

/**
 * Response with file content
 */
export const ResDBGetFileContentSchema = DbInstanceSchemaBase.extend({
  type: z.literal("resDBGetFile"),
  docId: z.string(),
  fileData: ProxyDocFileMetaSchema,
  content: z.instanceof(Uint8Array),
}).readonly();

export type ResDBGetFileContent = z.infer<typeof ResDBGetFileContentSchema>;

export const ReqApplyDatabaseConfigSchema = z.object({
  ...MsgBaseSchemaBase.shape,
  type: z.literal("reqApplyDatabaseConfig"),
  config: DatabaseConfigWithNameSchema,
});
export type ReqApplyDatabaseConfig = z.infer<typeof ReqApplyDatabaseConfigSchema>;

export const ResApplyDatabaseConfigSchema = z
  .object({
    ...MsgBaseSchemaBase.shape,
    type: z.literal("resApplyDatabaseConfig"),
    dbName: z.string(),
    dbId: z.string(), // typically ledger refId hash of the given config
  })
  .readonly();

export type ResApplyDatabaseConfig = z.infer<typeof ResApplyDatabaseConfigSchema>;

export function isResApplyDatabaseConfig(msg: MsgType): msg is ResApplyDatabaseConfig {
  return msg.type === "resApplyDatabaseConfig";
}

/**
 * Schema for ProxyBulkResponse
 */
export const ProxyBulkResponseSchema = z
  .object({
    ids: z.array(z.string()),
    clock: z.string(),
    name: z.string().optional(),
  })
  .readonly();

export type ProxyBulkResponse = z.infer<typeof ProxyBulkResponseSchema>;

/**
 * Request to bulk insert/update documents
 */
export const ReqDBBulkSchema = DbInstanceSchemaBase.extend({
  type: z.literal("reqDBBulk"),
  docs: z.array(z.any()), // Array of ProxyDocWithId<unknown> - generic type
}).readonly();

export type ReqDBBulk = z.infer<typeof ReqDBBulkSchema>;

/**
 * Response after bulk operation
 */
export const ResDBBulkSchema = DbInstanceSchemaBase.extend({
  type: z.literal("resDBBulk"),
  results: ProxyBulkResponseSchema,
}).readonly();

export type ResDBBulk = z.infer<typeof ResDBBulkSchema>;

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
