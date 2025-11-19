import { z } from "zod";
import { DbInstanceSchemaBase } from "./base.zod.js";

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
