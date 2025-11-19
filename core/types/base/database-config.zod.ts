import { z } from "zod";
import { BuildURI, URI, type CoerceURI, type ReadonlyURL, type WritableURL } from "@adviser/cement";

// CoerceURI transformer - converts various types to string using URI.from()
// CoerceURI = string | URI | ReadonlyURL | WritableURL | URL | BuildURI | NullOrUndef
const CoerceURISchema = z
  .union([
    z.string(),
    z.custom<URI>(),
    z.custom<BuildURI>(),
    z.custom<URL>(),
    z.custom<ReadonlyURL>(),
    z.custom<WritableURL>(),
    z.null(),
    z.undefined(),
  ])
  .transform((val) => URI.from(val as CoerceURI).toString());

export const StoreUrlsSchema = z.object({
  // string means local storage
  // URL means schema selects the storeType
  meta: CoerceURISchema.readonly(),
  car: CoerceURISchema.readonly(),
  file: CoerceURISchema.readonly(),
  wal: CoerceURISchema.readonly(),
});

export const StoreUrlsOptsSchema = z
  .object({
    base: CoerceURISchema.readonly(),
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

export const DatabaseConfigWithNameSchema = DatabaseConfigSchemaBase.extend({
  name: z.string(),
  refId: z.string(), // typically hash of the config
}).readonly();

export type DatabaseConfigWithName = z.infer<typeof DatabaseConfigWithNameSchema>;
