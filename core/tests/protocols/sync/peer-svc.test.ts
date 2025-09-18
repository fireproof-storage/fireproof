import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { PeersService } from "@fireproof/core-protocols-sync";
import { ensureSuperThis, hashBufferCID } from "@fireproof/core-runtime";
import { getGatewayFactoryItem, SerdeGatewayFactoryItem } from "@fireproof/core-blockstore";
import { DBTable, FPIndexedDB, Peers } from "@fireproof/core-types-blockstore";
import { withSuperThis, WithSuperThis } from "@fireproof/core-types-base";
import { URI } from "@adviser/cement";

describe("PeersService", () => {
  const sthis = ensureSuperThis();
  const backendURI = URI.from(sthis.env.get("FP_STORAGE_URL"));
  // console.log("backendURI", backendURI.toString())
  let gw: SerdeGatewayFactoryItem;
  let db: WithSuperThis<DBTable<Peers>>;
  let fpDb: FPIndexedDB;

  beforeAll(async () => {
    await sthis.start();
    gw = getGatewayFactoryItem(backendURI.protocol) as SerdeGatewayFactoryItem;
    fpDb = await gw.fpIndexedDB(sthis, backendURI.build().appendRelative("peers").URI());
    db = withSuperThis(fpDb.fpSync.peers(), sthis);
  });

  afterEach(async () => {
    await db.clear();
  });

  afterAll(async () => {
    await fpDb.close();
    await fpDb.destroy();
  });

  describe("upsert", () => {
    it("should create a new peers entry", async () => {
      const peers = {
        peerId: "peer-123",
        isLocal: false,
        url: "https://example.com/peer",
        lastAttempt: Date.now(),
        created: Date.now(),
      };

      const result = await PeersService.upsert(db, peers);

      expect(result.isOk()).toBe(true);
      expect(result.Ok().type).toBe("peers");
      expect(result.Ok().peerId).toBe(peers.peerId);
      expect(result.Ok().isLocal).toBe(peers.isLocal);
      expect(result.Ok().url).toBe(peers.url);
      expect(result.Ok().lastAttempt).toBe(peers.lastAttempt);
      expect(result.Ok().created).toBe(peers.created);
    });

    it("should create peers entry with optional fields", async () => {
      const peers = {
        isLocal: true,
        url: "https://local.example.com",
        lastSend: "block-log-123",
        lastError: "error-log-456",
        lastAttempt: 1234567890,
        created: 1234567890,
      };
      const result = await PeersService.upsert(db, peers);
      expect(result.isOk()).toBe(true);
      expect(result.Ok().peerId).toBe((await hashBufferCID(peers.url)).toString());
      expect(result.Ok().lastSend).toBe("block-log-123");
      expect(result.Ok().lastError).toBe("error-log-456");

      const p2 = {
        isLocal: false,
        url: "https://local.example.com",
        lastAttempt: 1234567899,
        created: 1234567899,
      };
      const result2 = await PeersService.upsert(db, p2);
      expect(result2.isOk()).toBe(true);
      expect(result2.Ok().peerId).toBe((await hashBufferCID(peers.url)).toString());
      expect(result2.Ok().created).toBe(1234567890);
      expect(result2.Ok().lastSend).toBe("block-log-123");
      expect(result2.Ok().lastError).toBe("error-log-456");
      expect(result2.Ok().lastAttempt).toBe(1234567899);
      expect(result2.Ok().isLocal).toBe(false);
    });

    it("should update existing peers entry", async () => {
      const initialPeers = {
        peerId: "update-peer",
        isLocal: false,
        url: "https://old.example.com",
        lastAttempt: 1000,
        created: 1000,
      };

      // Create initial entry
      await PeersService.upsert(db, initialPeers);

      // Update entry
      const updatedPeers = {
        peerId: "update-peer",
        isLocal: true,
        url: "https://new.example.com",
        lastSend: "new-block-log",
        lastAttempt: 2000,
        created: 333000, // Keep original created time
      };

      const result = await PeersService.upsert(db, updatedPeers);

      expect(result.isOk()).toBe(true);
      expect(result.Ok().isLocal).toBe(true);
      expect(result.Ok().url).toBe("https://new.example.com");
      expect(result.Ok().lastSend).toBe("new-block-log");
      expect(result.Ok().lastAttempt).toBe(2000);
      expect(result.Ok().created).toBe(1000);
    });
  });

  describe("get", () => {
    it("should retrieve existing peers entry", async () => {
      const peers = {
        peerId: "get-peer-test",
        isLocal: false,
        url: "https://get.example.com",
        lastSend: "block-123",
        lastAttempt: 1234567890,
        created: 1234567890,
      };

      await PeersService.upsert(db, peers);

      const result = await PeersService.get(db, "get-peer-test");

      expect(result.isOk()).toBe(true);
      expect(result.Ok()?.peerId).toBe("get-peer-test");
      expect(result.Ok()?.isLocal).toBe(false);
      expect(result.Ok()?.url).toBe("https://get.example.com");
      expect(result.Ok()?.lastSend).toBe("block-123");
      expect(result.Ok()?.lastAttempt).toBe(1234567890);
      expect(result.Ok()?.created).toBe(1234567890);
    });

    it("should return undefined for non-existent peer", async () => {
      const result = await PeersService.get(db, "non-existent-peer");

      expect(result.isOk()).toBe(true);
      expect(result.Ok()).toBeUndefined();
    });
  });
});
