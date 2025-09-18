import { DBTable, Peers, PeersSchema, toKV } from "@fireproof/core-types-blockstore";
import { Result } from "@adviser/cement";
import { hashBufferCID } from "@fireproof/core-runtime";

type CreatePeers = Omit<Omit<Omit<Omit<Peers, "type">, "peerId">, "created">, "isLocal"> & {
  peerId?: string;
  created?: number;
  isLocal?: boolean;
};

export const PeersService = {
  get: async (db: DBTable<Peers>, peerId: string): Promise<Result<Peers | undefined>> => {
    return db.get(peerId);
  },

  upsert: async (db: DBTable<Peers>, peers: CreatePeers): Promise<Result<Peers>> => {
    const entry: Peers = {
      type: "peers",
      ...peers,
      isLocal: peers.isLocal || false,
      created: typeof peers.created === "number" ? peers.created : Date.now(),
      peerId: peers.peerId || (await hashBufferCID(peers.url)).toString(),
    };
    // Validate with Zod schema
    const validated = PeersSchema.safeParse(entry);
    if (!validated.success) {
      return Result.Err(validated.error);
    }

    // console.log("upserting peers", validated.data);
    return db.transaction(async (tx) => {
      const rExisting = await tx.get(validated.data.peerId);
      if (rExisting.isErr()) {
        return Result.Err(rExisting);
      }
      const existing = rExisting.Ok() || { created: 0 };
      const result = {
        ...existing,
        ...validated.data,
        created: existing.created || validated.data.created,
      };
      return tx.put(toKV(result.peerId, result)).then((rKv) => {
        switch (true) {
          case rKv.isErr():
            return Result.Err(rKv);
          case rKv.isOk():
            return Result.Ok(rKv.Ok()[0].value);
          default:
            return Result.Err(new Error("unknown result"));
        }
      });
    });
  },
};
