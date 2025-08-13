import z from "zod";

export const RoleSchema = z.enum(["admin", "owner", "member"]);

export type Role = z.infer<typeof RoleSchema>;

export const ReadWriteSchema = z.enum(["read", "write"]);

export type ReadWrite = z.infer<typeof ReadWriteSchema>;

export const ProviderSchema = z.enum(["github", "google"]);
