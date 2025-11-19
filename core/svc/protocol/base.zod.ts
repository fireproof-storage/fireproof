import z from "zod";

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
