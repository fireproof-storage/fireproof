import { z } from "zod/v4";
import { JWTPayloadSchema } from "@fireproof/core-types-base";

// Role and ReadWrite enums
export const RoleSchema = z.enum(["admin", "owner", "member"]);
export const ReadWriteSchema = z.enum(["read", "write"]);

// Related interface schemas
export const TenantClaimSchema = z
  .object({
    id: z.string(),
    role: RoleSchema,
  })
  .readonly();

export const LedgerClaimSchema = z
  .object({
    id: z.string(),
    role: RoleSchema,
    right: ReadWriteSchema,
  })
  .readonly();

export const TenantLedgerSchema = z
  .object({
    tenant: z.string(),
    ledger: z.string(),
  })
  .readonly();

// Main FPCloudClaim schema
export const FPCloudClaimSchema = JWTPayloadSchema.extend({
  userId: z.string(),
  email: z.email(),
  nickname: z.string().optional(),
  provider: z.enum(["github", "google"]).optional(),
  created: z.date(),
  tenants: z.array(TenantClaimSchema),
  ledgers: z.array(LedgerClaimSchema),
  selected: TenantLedgerSchema,
}).readonly();

// Type inference from schemas
export type Role = z.infer<typeof RoleSchema>;
export type ReadWrite = z.infer<typeof ReadWriteSchema>;
export type TenantClaim = z.infer<typeof TenantClaimSchema>;
export type LedgerClaim = z.infer<typeof LedgerClaimSchema>;
export type TenantLedger = z.infer<typeof TenantLedgerSchema>;
export type FPCloudClaim = z.infer<typeof FPCloudClaimSchema>;

// For parsing JWT payload with date transformation
export const FPCloudClaimParseSchema = JWTPayloadSchema.extend({
  userId: z.string(),
  email: z.email(),
  nickname: z.string().optional(),
  provider: z.enum(["github", "google"]).optional(),
  // Transform string to Date if needed (common in JWT parsing)
  created: z.union([z.date(), z.string().transform((str) => new Date(str)), z.number().transform((num) => new Date(num))]),
  tenants: z.array(TenantClaimSchema),
  ledgers: z.array(LedgerClaimSchema),
  selected: TenantLedgerSchema,
}).readonly();
