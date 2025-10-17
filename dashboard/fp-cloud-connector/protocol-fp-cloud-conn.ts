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

// FPCCReqRegisterApp schema
export const FPCCReqRegisterAppSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCReqRegisterApp"),
  appURL: z.string(),
  appID: z.string(),
  localDbNames: z.array(z.string()),
}).readonly();

export type FPCCReqRegisterApp = z.infer<typeof FPCCReqRegisterAppSchema>;

// FPCCEvtApp schema
export const FPCCEvtAppSchema = FPCCMsgBaseSchemaBase.extend({
  type: z.literal("FPCCEvtApp"),
  appID: z.string(),
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
  localDbs: z.record(
    z.string(),
    z
      .object({
        tenantId: z.string(),
        ledgerId: z.string(),
        accessToken: z.string(),
      })
      .readonly(),
  ),
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

// Union schema for all message types
export const FPCCMessageSchema = z.discriminatedUnion("type", [
  FPCCEvtNeedsLoginSchema,
  FPCCErrorSchema,
  FPCCReqRegisterAppSchema,
  FPCCEvtAppSchema,
  FPCCPingSchema,
  FPCCPongSchema,
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

export function isFPCCReqRegisterApp(msg: FPCCMessage): msg is FPCCReqRegisterApp {
  return msg.type === "FPCCReqRegisterApp";
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
