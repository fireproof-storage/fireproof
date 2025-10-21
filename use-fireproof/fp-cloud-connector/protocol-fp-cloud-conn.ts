import { z } from "zod";

// Base message schema (without readonly for extension)
const FPCCMsgBaseSchemaBase = z.object({
  tid: z.string(),
  type: z.string(),
  src: z.string(),
  dst: z.string(),
});

export const FPCCMsgBaseSchema = FPCCMsgBaseSchemaBase.readonly();
export type FPCCMsgBase = z.infer<typeof FPCCMsgBaseSchema>;

// FPCCEvtNeedsLogin schema
export const FPCCEvtNeedsLoginSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCEvtNeedsLogin"),
  devId: z.string(),
  loginURL: z.string(),
  loginTID: z.string(),
  loadDbNames: z.array(
    z
      .object({
        appId: z.string(),
        dbName: z.string(),
        tenantId: z.string().optional(),
        ledgerId: z.string().optional(),
      })
      .readonly(),
  ),
  reason: z.enum(["BindCloud", "ConsumeAIToken", "FreeAITokenEnd"]),
}).readonly();

export type FPCCEvtNeedsLogin = z.infer<typeof FPCCEvtNeedsLoginSchema>;

// FPCCError schema
export const FPCCErrorSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCError"),
  message: z.string(),
  cause: z.string().optional(),
  stack: z.string().optional(),
}).readonly();

export type FPCCError = z.infer<typeof FPCCErrorSchema>;

// FPCCReqRegisterLocalDbName schema
export const FPCCReqRegisterLocalDbNameSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCReqRegisterLocalDbName"),
  appURL: z.string(),
  appId: z.string(),
  dbName: z.string(), // localDbName
  ledger: z.string().optional(),
  tenant: z.string().optional(),
}).readonly();

export type FPCCReqRegisterLocalDbName = z.infer<typeof FPCCReqRegisterLocalDbNameSchema>;

// FPCCEvtApp schema
export const FPCCEvtAppSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCEvtApp"),
  appId: z.string(),
  appFavIcon: z
    .object({
      defURL: z.string(),
      // room for more types and sizes
    })
    .readonly(),
  devId: z.string(),
  user: z
    .object({
      name: z.string(),
      email: z.string(),
      provider: z.enum(["google", "github"]),
      iconURL: z.string(),
    })
    .readonly(),
  localDb: z
    .object({
      dbName: z.string(),
      tenantId: z.string(),
      ledgerId: z.string(),
      accessToken: z.string(),
    })
    .readonly(),
  env: z.record(z.string(), z.record(z.string(), z.string())),
}).readonly();

export type FPCCEvtApp = z.infer<typeof FPCCEvtAppSchema>;

// FPCCPing schema
export const FPCCPingSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCPing"),
  timestamp: z.number().optional(),
}).readonly();

export type FPCCPing = z.infer<typeof FPCCPingSchema>;

// FPCCPong schema
export const FPCCPongSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCPong"),
  timestamp: z.number().optional(),
  pingTid: z.string(), // Reference to the ping message tid
}).readonly();

export type FPCCPong = z.infer<typeof FPCCPongSchema>;

// FPCCEvtConnectorReady schema
export const FPCCEvtConnectorReadySchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCEvtConnectorReady"),
  timestamp: z.number(),
  seq: z.number(),
  devId: z.string(),
}).readonly();

export type FPCCEvtConnectorReady = z.infer<typeof FPCCEvtConnectorReadySchema>;

// FPCCReqWaitConnectorReady schema
export const FPCCReqWaitConnectorReadySchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCReqWaitConnectorReady"),
  timestamp: z.number(),
  appId: z.string(),
  seq: z.number(),
}).readonly();

export type FPCCReqWaitConnectorReady = z.infer<typeof FPCCReqWaitConnectorReadySchema>;

// Union schema for all message types
export const FPCCMessageSchema = z.discriminatedUnion("type", [
  FPCCEvtNeedsLoginSchema,
  FPCCErrorSchema,
  FPCCReqRegisterLocalDbNameSchema,
  FPCCEvtAppSchema,
  FPCCPingSchema,
  FPCCPongSchema,
  FPCCEvtConnectorReadySchema,
  FPCCReqWaitConnectorReadySchema,
]);

export type FPCCMessage = z.infer<typeof FPCCMessageSchema>;

export type FPCCSendMessage<T extends FPCCMsgBase> = Omit<Omit<T, "tid">, "src"> & {
  src?: T["src"] | undefined;
  tid?: T["tid"] | undefined;
};

// // Send message type - makes src and tid optional for convenience
// export type FPCCSendMessage = {
//   [K in keyof FPCCMessage]: K extends 'src' | 'tid'
//     ? FPCCMessage[K] | undefined
//     : FPCCMessage[K]
// };

// Type guard functions

/**
 * Validates if unknown data is a valid FPCC message using Zod safeParse
 */
export function validateFPCCMessage(data: unknown) {
  return FPCCMessageSchema.safeParse(data);
}

export function isFPCCEvtNeedsLogin(msg: FPCCMessage): msg is FPCCEvtNeedsLogin {
  return msg.type === "FPCCEvtNeedsLogin";
}

export function isFPCCError(msg: FPCCMessage): msg is FPCCError {
  return msg.type === "FPCCError";
}

export function isFPCCReqRegisterLocalDbName(msg: FPCCMessage): msg is FPCCReqRegisterLocalDbName {
  return msg.type === "FPCCReqRegisterLocalDbName";
}

export function isFPCCEvtApp(msg: FPCCMessage): msg is FPCCEvtApp {
  return msg.type === "FPCCEvtApp";
}

export function isFPCCPing(msg: FPCCMessage): msg is FPCCPing {
  return msg.type === "FPCCPing";
}

export function isFPCCPong(msg: FPCCMessage): msg is FPCCPong {
  return msg.type === "FPCCPong";
}

export function isFPCCEvtConnectorReady(msg: FPCCMessage): msg is FPCCEvtConnectorReady {
  return msg.type === "FPCCEvtConnectorReady";
}

export function isFPCCReqWaitConnectorReady(msg: FPCCMessage): msg is FPCCReqWaitConnectorReady {
  return msg.type === "FPCCReqWaitConnectorReady";
}
