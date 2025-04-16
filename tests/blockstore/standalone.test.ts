import { BuildURI, runtimeFn, URI } from "@adviser/cement";
import { ensureSuperThis, PARAM, CRDTImpl, CRDT, LedgerOpts } from "@fireproof/core";
import { Link } from "multiformats";

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

  describe("blk-stack", () => {
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
