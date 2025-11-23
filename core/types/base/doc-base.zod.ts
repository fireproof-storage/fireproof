import { z } from "zod/v4";

/**
 * Zod schema for DocFileMeta interface
 */
export const DocFileMetaSchema = z
  .object({
    type: z.string(),
    size: z.number(),
    cid: z.any(), // AnyLink type - would need proper schema if AnyLink has a specific structure
    car: z.any().optional(), // AnyLink type
    lastModified: z.number().optional(),
    url: z.string().optional(),
    // file is a function that returns Promise<File>, but Zod function validation is complex
    // so we'll use z.any() for the function type
    file: z.any().optional(),
  })
  .readonly();

export type DocFileMeta = z.infer<typeof DocFileMetaSchema>;

/**
 * Schema for DocFiles - a record of DocFileMeta or File objects
 */
export const DocFilesSchema = z.record(z.string(), z.union([DocFileMetaSchema, z.instanceof(File)]));

export type DocFiles = z.infer<typeof DocFilesSchema>;

/**
 * Zod schema for DocBase interface
 */
export const DocBaseSchema = z
  .object({
    _id: z.string(),
    _files: DocFilesSchema.optional(),
    _publicFiles: DocFilesSchema.optional(),
    _deleted: z.boolean().optional(),
  })
  .readonly();

export type DocBase = z.infer<typeof DocBaseSchema>;

/**
 * Partial version of DocBaseSchema for use in DocSet
 */
const PartialDocBaseSchema = z
  .object({
    _id: z.string(),
    _files: DocFilesSchema.optional(),
    _publicFiles: DocFilesSchema.optional(),
    _deleted: z.boolean().optional(),
  })
  .partial()
  .readonly();

/**
 * Schema factory for DocWithId<T> - creates a schema that intersects DocBase with T
 * @param docSchema - The Zod schema for type T (the document type)
 * @returns A Zod schema for DocWithId<T>
 *
 * @example
 * const MyDocSchema = z.object({ name: z.string(), age: z.number() });
 * const MyDocWithIdSchema = DocWithIdSchema(MyDocSchema);
 * type MyDocWithId = z.infer<typeof MyDocWithIdSchema>;
 */
export function DocWithIdSchema<T extends z.ZodTypeAny>(docSchema: T) {
  return DocBaseSchema.and(docSchema);
}

export type DocWithId<T> = z.infer<ReturnType<typeof DocWithIdSchema<z.ZodType<T>>>>;

/**
 * Schema factory for DocSet<T> - creates a schema that intersects Partial<DocBase> with T
 * @param docSchema - The Zod schema for type T (the document type)
 * @returns A Zod schema for DocSet<T>
 *
 * @example
 * const MyDocSchema = z.object({ name: z.string(), age: z.number() });
 * const MyDocSetSchema = DocSetSchema(MyDocSchema);
 * type MyDocSet = z.infer<typeof MyDocSetSchema>;
 */
export function DocSetSchema<T extends z.ZodTypeAny>(docSchema: T) {
  return PartialDocBaseSchema.and(docSchema);
}

export type DocSet<T> = z.infer<ReturnType<typeof DocSetSchema<z.ZodType<T>>>>;
