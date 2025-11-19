import { z } from "zod";
import { ProxyDocFileMetaSchema, ProxyDocWithId, ProxyDocWithIdSchema } from "./doc-base.zod.js";
import { DbInstanceSchemaBase } from "./base.zod.js";

/**
 * Request to get a document by ID
 */
export const ReqDBGetSchema = DbInstanceSchemaBase.extend({
  type: z.literal("reqDBGet"),
  docIds: z.array(z.string()),
}).readonly();

export type ReqDBGet = z.infer<typeof ReqDBGetSchema>;

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
