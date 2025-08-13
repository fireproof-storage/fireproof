import { JWTPayloadSchema } from "@fireproof/core-types-base";
import { z } from "zod";
import { ProviderSchema, ReadWriteSchema, RoleSchema } from "./enums.zod.js";

// Zod schemas
export const V1TenantClaimSchema = z.object({
  id: z.string().readonly(),
  role: RoleSchema.readonly(),
});

export type V1TenantClaim = z.infer<typeof V1TenantClaimSchema>;

export const V1LedgerClaimSchema = z.object({
  id: z.string().readonly(),
  role: RoleSchema.readonly(),
  right: ReadWriteSchema.readonly(),
});

export type V1LedgerClaim = z.infer<typeof V1LedgerClaimSchema>;

export const TenantLedgerSchema = z.object({
  tenant: z.string().readonly(),
  ledger: z.string().readonly(),
});

export type TenantLedger = z.infer<typeof TenantLedgerSchema>;

export const FPUserTokenSchema = JWTPayloadSchema.extend({
  // FPCloudClaim specific fields
  userId: z.string().readonly(),
  email: z.string().email().readonly(),
  nickname: z.string().optional().readonly(),
  provider: ProviderSchema.readonly(),
  created: z.date().readonly(),
  tenants: z.array(V1TenantClaimSchema).readonly(), // always empty compatible to V1
  ledgers: z.array(V1LedgerClaimSchema).readonly(), // always empty compatible to V1
  selected: TenantLedgerSchema.readonly(), // dummy data
});

// Type inference from schema
export type FPUserToken = z.infer<typeof FPUserTokenSchema>;
