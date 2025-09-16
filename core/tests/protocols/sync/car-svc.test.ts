import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CarsService, SyncDatabase } from "@fireproof/core-protocols-sync";
import { ensureSuperThis } from "@fireproof/core-runtime";

describe("CarsService", () => {
  const sthis = ensureSuperThis();
  const db = new SyncDatabase(sthis, "dexie://test-sync-db");

  beforeEach(async () => {
    await sthis.start();
    await db.ready();
  });

  afterEach(async () => {
    await db.close();
    await db.destroy();
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