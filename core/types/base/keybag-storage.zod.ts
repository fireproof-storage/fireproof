import { z } from "zod/v4";
import { DeviceIdKeyBagItemSchema } from "./device-id-keybag-item.zod.js";

export const V1StorageKeyItemSchema = z
  .object({
    name: z.string(),
    key: z.string(),
  })
  .readonly();

export const V2KeysItemSchema = z
  .object({
    key: z.string(), // material
    fingerPrint: z.string(),
    default: z.boolean().optional(),
  })
  .readonly();

export type KeysItem = z.infer<typeof V2KeysItemSchema>;

export const V2StorageKeyItemSchema = z
  .object({
    name: z.string(),
    keys: z.record(z.string(), V2KeysItemSchema),
  })
  .readonly();

export type V1StorageKeyItem = z.infer<typeof V1StorageKeyItemSchema>;
export type V2StorageKeyItem = z.infer<typeof V2StorageKeyItemSchema>;
export type V2KeysItem = z.infer<typeof V2KeysItemSchema>;

export const KeyedV2StorageKeyItemSchema = z
  .object({
    id: z.string(),
    clazz: z.literal("V2StorageKeyItem"),
    item: V2StorageKeyItemSchema,
  })
  .readonly();

export const KeyedDeviceIdKeyBagItemSchema = z
  .object({
    id: z.string(),
    clazz: z.literal("DeviceIdKeyBagItem"),
    item: DeviceIdKeyBagItemSchema,
  })
  .readonly();

export const KeyedJwtKeyBagItemSchema = z
  .object({
    id: z.string(),
    clazz: z.literal("JwtKeyBagItem"),
    item: z.object({
      jwtStr: z.string(),
    }),
  })
  .readonly();

export const KeyedItemSchema = KeyedV2StorageKeyItemSchema.or(KeyedDeviceIdKeyBagItemSchema).or(KeyedJwtKeyBagItemSchema);
export type KeyedItem = z.infer<typeof KeyedItemSchema>;

export type KeyedV2StorageKeyItem = z.infer<typeof KeyedV2StorageKeyItemSchema>;
export type KeyedDeviceIdKeyBagItem = z.infer<typeof KeyedDeviceIdKeyBagItemSchema>;
export type KeyedJwtKeyBagItem = z.infer<typeof KeyedJwtKeyBagItemSchema>;

export const LegacyKeyedItemSchema = KeyedItemSchema.or(V1StorageKeyItemSchema).or(V2StorageKeyItemSchema).readonly();

export type LegacyKeyedItem = z.infer<typeof LegacyKeyedItemSchema>;
