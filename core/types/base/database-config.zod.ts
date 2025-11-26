import { z } from "zod";

export const StoreUrlsSchema = z.object({
  // string means local storage
  // URL means schema selects the storeType
  meta: z.string(),
  car: z.string(),
  file: z.string(),
  wal: z.string(),
});

export const StoreUrlsOptsSchema = z
  .object({
    base: z.string().optional(),
    data: StoreUrlsSchema.partial(),
    idx: StoreUrlsSchema.partial(),
  })
  .readonly();

export type StoreUrls = z.infer<typeof StoreUrlsSchema>;
export type StoreUrlsOpts = z.infer<typeof StoreUrlsOptsSchema>;

const DatabaseConfigSchemaBase = z.object({
  env: z.record(z.string(), z.string()),
  ctx: z.record(z.string(), z.string()),
  // public: z.boolean(),
  writeQueue: z.object({
    chunkSize: z.number(),
  }),
  autoCompact: z.number(),
  compactStrategy: z.string(), // default "FULL" other "fireproof" , "no-op"
  storeUrls: StoreUrlsOptsSchema.optional(),
  threshold: z.number(),
});

export const DatabaseConfigSchema = DatabaseConfigSchemaBase.readonly();

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export const DatabaseConfigWithNameSchema = z.object({
  ...DatabaseConfigSchemaBase.partial().shape,
  name: z.string(),
  refId: z.string(), // typically hash of the config
});

export type DatabaseConfigWithName = z.infer<typeof DatabaseConfigWithNameSchema>;
