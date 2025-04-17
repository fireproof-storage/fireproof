import { BuildURI, runtimeFn, URI } from "@adviser/cement";
import { ensureSuperThis, PARAM, CRDTImpl, CRDT, LedgerOpts, fireproof, bs } from "@fireproof/core";
import { Link } from "multiformats";
// import { dde as cborDecode } from "@ipld/dag-cbor";
import { stripper } from "@adviser/cement/utils";

describe("standalone", () => {
  const sthis = ensureSuperThis();

  // it.skip("CIDPeer", async () => {
  //   const cid = await hashObjectCID({ cid: "test", peer: "peer" });
  //   const peer = sthis.txt.encode("peer");
  //   const cp = new CIDPeer(cid.cid, peer);
  //   expect(cp.cid.toString()).toEqual(cid.cid.toString());
  //   expect(cp.peer).toEqual(peer);
  //   expect(cp.toString()).toEqual("bagiy4ancmnrwszcyeuayabaseabbkwg7pmwdxrj766jov33byzsd5ju4rsnplrasx6zfy7pm3quwyzdqmvsxerdqmvsxe");
  //   const cp2 = CIDPeer.parse(cp.toString());
  //   expect(cp2.cid.toString()).toEqual(cid.cid.toString());
  //   expect(cp2.peer).toEqual(peer);
  // });

  describe("howto-loader", () => {
    beforeAll(async () => {
      const db = fireproof("howto-loader", {
        storeUrls: {
          base: "file://dist/how-to-loader?store-key=insecure",
        },
      });
      for (let cid = 0; cid < 1; cid++) {
        const blk = new Array(3)
          .fill(0)
          .map((_, peer) => ({ _id: `test-${cid}:peer-${peer}`, value: { cid: `test-${cid}`, peer: `peer-${peer}` } }));
        await db.bulk(blk);
      }
      // await db.compact()
      await db.close();
    });

    it.skip("understand loader", async () => {
      const db = fireproof("howto-loader", {
        storeUrls: {
          base: "file://dist/how-to-loader?store-key=insecure",
        },
      });
      const fn = vi.fn();
      const loader = db.ledger.crdt.blockstore.loader as bs.Loader;
      loader.cidCache.onSet(fn);
      expect(fn).toHaveBeenCalledTimes(0);
      await db.ready();
      expect(
        loader.cidCache.values().map((i) => {
          const v = i.value.Ok();
          return {
            type: v.item.type,
            cid: v.cid,
            value: stripper(/(type|cid)/, v.item),
          };
        }),
      ).toEqual([]);
      // let last = 0
      // for (let i = 0; i < 100; i++) {
      //   if (last !== fn.mock.calls.length) {
      //     console.log("fn", i, fn.mock.calls.length);
      //     last = fn.mock.calls.length
      //   }
      //   await sleep(10);
      // }
      const ret = await db.allDocs();
      expect(ret.rows.length).toBe(100);
      expect(fn).toHaveBeenCalledTimes(109393);
      await db.close();
    });
  });

  describe.skip("crdt-stack", () => {
    let crdt: CRDT;
    beforeEach(async () => {
      let uri: URI;
      switch (true) {
        case runtimeFn().isBrowser:
          uri = BuildURI.from("indexeddb://standalone-peer-log").setParam(PARAM.NAME, "peer-log").URI();
          break;
        default:
          uri = BuildURI.from("file://dist/standalone")
            .setParam(PARAM.NAME, "peer-log")
            .setParam(PARAM.STORE_KEY, "insecure")
            .URI();
          break;
      }
      // console.log("uri", uri.toString());
      crdt = new CRDTImpl(sthis, {
        name: "peer-log",
        writeQueue: { chunkSize: 32 },
        storeUrls: {
          data: {
            meta: uri.build().setParam(PARAM.STORE, "meta").setParam(PARAM.STORE_KEY, "insecure").URI(),
            car: uri.build().setParam(PARAM.STORE, "car").setParam(PARAM.STORE_KEY, "insecure").URI(),
            file: uri.build().setParam(PARAM.STORE, "file").setParam(PARAM.STORE_KEY, "insecure").URI(),
            wal: uri.build().setParam(PARAM.STORE, "wal").setParam(PARAM.STORE_KEY, "insecure").URI(),
          },
        },
      } as LedgerOpts);
      await crdt.ready();
    });
    afterEach(async () => {
      await crdt.close();
    });

    it.each(new Array(10).fill(0).map((_, i) => ({ cid: i })))("write:$cid", async ({ cid }) => {
      const peers = new Array(10).fill(0).map((_, peer) => {
        return { id: `test-${cid}:peer-${peer}`, value: { cid: `test-${cid}`, peer: `peer-${peer}` } };
      });
      await crdt.bulk(peers);
    });
    it("read", async () => {
      for (let cid = 0; cid < 10; cid++) {
        for (let peer = 0; peer < 10; peer++) {
          const id = `test-${cid}:peer-${peer}`;
          const res = (await crdt.get(id)) as unknown as { cid: Link; doc: { cid: string; peer: string } };
          expect(res.doc).toEqual({ cid: `test-${cid}`, peer: `peer-${peer}` });
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
