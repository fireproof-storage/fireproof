import { BuildURI, to_uint8, URI } from "@adviser/cement";
import { bs, ensureSuperThis, hashObjectCID, CIDPeer, PARAM } from "@fireproof/core";
import { entries } from "@web3-storage/pail/crdt";
import { CID } from "multiformats/cid";

describe("standalone", () => {
  const sthis = ensureSuperThis();

  it("CIDPeer", async () => {
    const cid = await hashObjectCID({ cid: "test", peer: "peer" });
    const cp = new CIDPeer(cid.cid, "peer");
    expect(cp.cid.toString()).toEqual(cid.cid.toString());
    expect(cp.peer).toEqual("peer");
    expect(cp.toString()).toEqual(`${cid.cid.toString()}:peer`);
    const cp2 = CIDPeer.parse(to_uint8(cp.toString()), sthis);
    expect(cp2.cid.toString()).toEqual(cid.cid.toString());
    expect(cp2.peer).toEqual("peer");
  });

  describe("blk-stack", () => {
    let blk: bs.BaseBlockstoreImpl;
    beforeEach(async () => {
      const uri = BuildURI.from(sthis.env.get("FP_STORAGE_URL")).appendRelative("blk-stack").URI();
      console.log("uri", uri.toString());
      blk = new bs.BaseBlockstoreImpl({
        storeRuntime: bs.toStoreRuntime(sthis, {}),
        storeUrls: {
          meta: uri.build().setParam("store", "meta").URI(),
          car: uri.build().setParam("store", "car").URI(),
          file: uri.build().setParam("store", "file").URI(),
          wal: uri.build().setParam("store", "wal").URI(),
        },
      } as bs.BlockstoreOpts);
      await blk.ready();
    });
    afterEach(async () => {
      await blk.close();
    });

    it("create", async () => {
      const tx = blk.openTransaction();
      for (let cid = 0; cid < 10; cid++) {
        for (let peer = 0; peer < 10; peer++) {
          const obj = await hashObjectCID({ cid: `test-${cid}`, peer: `peer-${peer}` });
          await tx.put(new CIDPeer(obj.cid, obj.obj.peer), obj.bytes);
        }
      }
      blk.commitTransaction(tx);
    });
    it("read", async () => {
      for (let cid = 0; cid < 10; cid++) {
        for (let peer = 0; peer < 10; peer++) {
          const obj = await hashObjectCID({ cid: `test-${cid}`, peer: `peer-${peer}` });
          const res = await blk.get(new CIDPeer(obj.cid, obj.obj.peer));
          expect(res?.bytes).toEqual(obj.bytes);
        }
      }
    });
    // for (let cid = 0; cid < 10; cid++) {
    //   const gte = `test-${cid}`;
    //   const ret = [];
    //   for await (const [key, link] of entries(blk, root, { gte })) {
    //     ret.push([key, link]);
    //   }
    //   expect(ret.length).toEqual(10);
    // }
  });
});
