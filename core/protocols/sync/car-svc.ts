import { Cars, CarsSchema } from "@fireproof/core-types-protocols-sync";
import { SyncDatabase } from "./sync-db.js";
import { exception2Result, Result } from "@adviser/cement";

type CreateCars = Omit<Cars, "type">;

export const CarsService = {
  get: async (db: SyncDatabase, carCid: string): Promise<Result<Cars | undefined>> => {
    return exception2Result(async () => {
      const cars = await db.cars.get(carCid);
      return cars;
    });
  },

  upsert: async (db: SyncDatabase, cars: CreateCars): Promise<Result<Cars>> => {
    return exception2Result(async () => {
      const entry: Cars = {
        type: "cars",
        ...cars,
      };
      // Validate with Zod schema
      const validated = CarsSchema.safeParse(entry);
      if (!validated.success) {
        throw validated.error;
      }

      let existing: Cars | undefined;
      await db.transaction("rw", ["cars"], async () => {
        const fromGet = (await db.cars.get(cars.carCid)) || { peers: [] };
        existing = {
          ...fromGet,
          ...validated.data,
          peers: fromGet.peers ? [...new Set([...fromGet.peers, ...validated.data.peers])] : validated.data.peers,
        };
        await db.cars.put(existing);
      });
      if (!existing) {
        throw new Error("Failed to upsert cars");
      }
      return existing;
    });
  },
};
