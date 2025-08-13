import { JWTPayloadSchema } from "@fireproof/core-types-base";
import { z } from "zod";
import { V1LedgerClaimSchema, V1TenantClaimSchema } from "./fp-user-token.zod.js";

export const V2LedgerClaimSchema = V1LedgerClaimSchema.extend({
  names: z.array(z.string()).nonempty(), // the bindings of ledger to names never empty
});

export type V2LedgerClaim = z.infer<typeof V2LedgerClaimSchema>;

export const V2TenantClaimSchema = V1TenantClaimSchema.extend({
  names: z.array(z.string()).nonempty(), // the bindings of ledger to names never empty
});

export type V2TenantClaim = z.infer<typeof V2TenantClaimSchema>;

export const V2LedgerTokenSchema = JWTPayloadSchema.extend({
  ledger: V2LedgerClaimSchema.readonly(),
  tenant: V2TenantClaimSchema.readonly(),
});

export type V2LedgerToken = z.infer<typeof V2LedgerTokenSchema>;
