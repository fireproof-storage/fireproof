import { describe, it, expect, afterEach, afterAll, beforeAll } from "vitest";
import { CarsService } from "@fireproof/core-protocols-sync";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { getGatewayFactoryItem, SerdeGatewayFactoryItem } from "@fireproof/core-blockstore";
import { DBTable, FPIndexedDB, Cars } from "@fireproof/core-types-blockstore";
import { withSuperThis, WithSuperThis } from "use-fireproof";
import { URI } from "@adviser/cement";

describe("CarsService", () => {
  const sthis = ensureSuperThis();
  const backendURI = URI.from(sthis.env.get("FP_STORAGE_URL"));
  let gw: SerdeGatewayFactoryItem;
  let db: WithSuperThis<DBTable<Cars>>;
  let fpDb: FPIndexedDB;

  beforeAll(async () => {
    await sthis.start();
    gw = getGatewayFactoryItem(backendURI.protocol) as SerdeGatewayFactoryItem;
    fpDb = await gw.fpIndexedDB(sthis, backendURI.build().appendRelative("cars").URI());
    db = withSuperThis(fpDb.fpSync.cars(), sthis);
  });
  afterEach(async () => {
    await db.clear();
  });

  afterAll(async () => {
    await fpDb.close();
    await fpDb.destroy();
  });

  describe("upsert", () => {
    it("should create a new cars entry", async () => {
      const cars = {
        carCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        entries: ["cid1", "cid2"],
        created: Date.now(),
        peers: ["peer1", "peer2"],
      };

      const result = await CarsService.upsert(db, cars);

      expect(result.isOk()).toBe(true);
      expect(result.Ok().type).toBe("cars");
      expect(result.Ok().carCid).toBe(cars.carCid);
      expect(result.Ok().entries).toEqual(cars.entries);
      expect(result.Ok().peers).toEqual(cars.peers);
    });

    it("should merge peers when updating existing entry", async () => {
      const initialCars = {
        carCid: "test-car-cid",
        entries: ["cid1", "cid2"],
        created: Date.now(),
        peers: ["peer1", "peer2"],
      };

      // Create initial entry
      await CarsService.upsert(db, initialCars);

      // Update with new peers
      const updatedCars = {
        carCid: "test-car-cid",
        entries: ["cid1", "cid2", "cid3"],
        created: Date.now(),
        peers: ["peer2", "peer3"], // peer2 overlaps, peer3 is new
      };

      const result = await CarsService.upsert(db, updatedCars);

      expect(result.isOk()).toBe(true);
      expect(result.Ok().peers).toEqual(["peer1", "peer2", "peer3"]);
      expect(result.Ok().entries).toEqual(["cid1", "cid2", "cid3"]);
    });

    it("should deduplicate peers", async () => {
      const cars = {
        carCid: "test-dedup-cid",
        entries: ["cid1"],
        created: Date.now(),
        peers: ["peer1", "peer1", "peer2"], // duplicate peer1
      };

      const result = await CarsService.upsert(db, cars);

      expect(result.isOk()).toBe(true);
      expect(result.Ok().peers).toEqual(["peer1", "peer2"]);
    });
  });

  describe("get", () => {
    it("should retrieve existing cars entry", async () => {
      const cars = {
        carCid: "test-get-car-cid",
        entries: ["cid1", "cid2"],
        created: 1234567890,
        peers: ["peer1", "peer2"],
      };

      await CarsService.upsert(db, cars);

      const result = await CarsService.get(db, "test-get-car-cid");

      expect(result.isOk()).toBe(true);
      expect(result.Ok()?.carCid).toBe("test-get-car-cid");
      expect(result.Ok()?.entries).toEqual(["cid1", "cid2"]);
      expect(result.Ok()?.created).toBe(1234567890);
      expect(result.Ok()?.peers).toEqual(["peer1", "peer2"]);
    });

    it("should return undefined for non-existent car", async () => {
      const result = await CarsService.get(db, "non-existent-car-cid");

      expect(result.isOk()).toBe(true);
      expect(result.Ok()).toBeUndefined();
    });
  });
});
