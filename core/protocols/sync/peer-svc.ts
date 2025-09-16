import { Peers, PeersSchema } from "@fireproof/core-types-protocols-sync";
import { SyncDatabase } from "./sync-db.js";
import { exception2Result, Result } from "@adviser/cement";
import { hashBufferCID } from "@fireproof/core-runtime";

type CreatePeers = Omit<Omit<Omit<Omit<Peers, "type">, "peerId">, "created">, "isLocal"> & { peerId?: string; created?: number; isLocal?: boolean };

export const PeersService = {
  get: async (db: SyncDatabase, peerId: string): Promise<Result<Peers | undefined>> => {
    return exception2Result(async () => {
      const peers = await db.peers.get(peerId);
      return peers;
    });
  },

  upsert: async (db: SyncDatabase, peers: CreatePeers): Promise<Result<Peers>> => {
    return exception2Result(async () => {
      const entry: Peers = {
        type: "peers",
        ...peers,
        isLocal: peers.isLocal || false,
        created: typeof peers.created === 'number' ? peers.created : Date.now(),
        peerId: peers.peerId || (await hashBufferCID(peers.url)).toString()
      };
      // Validate with Zod schema
      const validated = PeersSchema.safeParse(entry);
      if (!validated.success) {
        throw validated.error;
      }

      // console.log("upserting peers", validated.data);
      let result: Peers | undefined;
      await db.transaction("rw", ["peers"], async () => {
        const existing = await db.peers.get(validated.data.peerId) || { created: 0 };;
        result = {
          ...existing,
          ...validated.data,
          created: existing.created || validated.data.created,
        }; 
        await db.peers.put(result);
      });
      if (!result) {
        throw new Error("Failed to upsert peers");
      }
      return result;
    });
  },
};