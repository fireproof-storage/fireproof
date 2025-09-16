
import { z } from 'zod';

// Zod schemas
export const BlockLogSchema = z.object({
  type: z.literal("block"),
  seq: z.string(), // key // typical V6 UUID
  car: z.string(),
}).readonly();

export const CarsSchema = z.object({
  type: z.literal("cars"),
  carCid: z.string(), // key
  entries: z.array(z.string()), // cids of entries
  created: z.number(), // timestamp
  peers: z.array(z.string()), // peers that have this car
}).readonly();

export const CidSetSchema = z.object({
  type: z.literal("cidSet"),
  cid: z.string(), // key
  car: z.string(),
}).readonly();

export const PeersSchema = z.object({
  type: z.literal("peers"),
  peerId: z.string(), // key hash of url 
  isLocal: z.boolean(),
  url: z.string(),
  lastSend: z.string().optional(), // points to blockLog
  lastError: z.string().optional(), // points to blockLog
  // is lastError is set we wait retryInterval plus lastAttempt
  lastAttempt: z.number(), // local Timestamp
  created: z.number(), // timestamp
}).readonly();

// Type inference from Zod schemas
export type BlockLog = z.infer<typeof BlockLogSchema>;
export type Cars = z.infer<typeof CarsSchema>;
export type CidSet = z.infer<typeof CidSetSchema>;
export type Peers = z.infer<typeof PeersSchema>;
