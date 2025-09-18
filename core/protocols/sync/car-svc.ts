import { Cars, CarsSchema, DBTable, toKV } from "@fireproof/core-types-blockstore";
import { Result } from "@adviser/cement";

type CreateCars = Omit<Cars, "type">;

export const CarsService = {
  get: async (db: DBTable<Cars>, carCid: string): Promise<Result<Cars | undefined>> => {
    return db.get(carCid);
  },

  upsert: async (db: DBTable<Cars>, cars: CreateCars): Promise<Result<Cars>> => {
    const entry: Cars = {
      type: "cars",
      ...cars,
    };
    // Validate with Zod schema
    const validated = CarsSchema.safeParse(entry);
    if (!validated.success) {
      return Result.Err(validated.error);
    }

    return db.transaction(async (db) => {
      const rFromGet = await db.get(cars.carCid);
      if (rFromGet.isErr()) {
        return Result.Err(rFromGet);
      }
      const fromGet = rFromGet.Ok() || { peers: [] };
      const existing = {
        ...fromGet,
        ...validated.data,
        peers: fromGet.peers ? [...new Set([...fromGet.peers, ...validated.data.peers])] : validated.data.peers,
      };
      return db.put(toKV(existing.carCid, existing)).then((rKv) => {
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
