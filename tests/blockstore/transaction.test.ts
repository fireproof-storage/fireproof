import { CID } from "multiformats";
import { BaseBlockstore, bs, CarTransaction, ensureSuperThis, SuperThis } from "@fireproof/core";
import { simpleBlockOpts } from "../helpers.js";

describe("Fresh TransactionBlockstore", function () {
  let blocks: BaseBlockstore;
  const sthis = ensureSuperThis();
  beforeEach(async () => {
    blocks = new bs.BaseBlockstoreImpl(simpleBlockOpts(sthis));
    await blocks.ready();
  });
  // it("should not have a name", function () {
  //   expect(blocks.name).toBeFalsy();
  // });
  // it("should not have a loader", function () {
  //   expect(blocks.loader).toBeFalsy();
  // });
  it("should not put", async () =>{
    const value = sthis.txt.encode("value");
    const e = await blocks.put("key" as unknown as bs.AnyLink, value).catch((e) => e);
    expect(e.message).toMatch(/transaction/g);
  });
  it("should yield a transaction", async () =>{
    const txR = await blocks.transaction(async (tblocks) => {
      expect(tblocks).toBeTruthy();
      expect(tblocks instanceof bs.CarTransactionImpl).toBeTruthy();
      return { head: [] };
    });
    expect(txR).toBeTruthy();
    expect(txR.t).toBeTruthy();
    expect(txR.meta).toEqual({ head: [] });
  });
});

describe("TransactionBlockstore with name", function () {
  let blocks: bs.EncryptedBlockstore;
  const sthis = ensureSuperThis();
  beforeEach(async () => {
    blocks = new bs.EncryptedBlockstore(sthis, simpleBlockOpts(sthis));
    await blocks.ready();
  });
  // it("should have a name", function () {
  //   expect(blocks.name).toEqual("test");
  // });
  it("should have a loader", function () {
    expect(blocks.loader).toBeTruthy();
  });
  it("should get from loader", async () =>{
    const bytes = sthis.txt.encode("bytes");
    expect(blocks.loader).toBeTruthy();
    blocks.loader.getBlock = async (cid) => {
      return { cid, bytes };
    };
    const value = await blocks.get("key" as unknown as bs.AnyAnyLink);
    expect(value).toEqual({ cid: "key" as unknown as bs.AnyAnyLink, bytes });
  });
});

describe("A transaction", function () {
  let tblocks: CarTransaction;
  let blocks: bs.EncryptedBlockstore;
  const sthis = ensureSuperThis();
  beforeEach(async () =>{
    blocks = new bs.EncryptedBlockstore(sthis, simpleBlockOpts(sthis, "test"));
    tblocks = new bs.CarTransactionImpl(blocks);
    blocks.transactions.add(tblocks);
  });
  it("should put and get", async () =>{
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const bytes = sthis.txt.encode("bytes");
    await tblocks.put(cid, bytes);
    expect(blocks.transactions.has(tblocks)).toBeTruthy();
    const got = await tblocks.get(cid);
    expect(got).toBeTruthy();
    expect(got?.cid).toEqual(cid);
    expect(got?.bytes).toEqual(bytes);
  });
});

function asUInt8Array(str: string, sthis: SuperThis) {
  return sthis.txt.encode(str);
}

describe("TransactionBlockstore with a completed transaction", function () {
  let blocks: BaseBlockstore;
  let cid: CID;
  let cid2: CID;
  const sthis = ensureSuperThis();

  beforeEach(async () =>{
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    cid2 = CID.parse("bafybeibgouhn5ktecpjuovt52zamzvm4dlve5ak7x6d5smms3itkhplnhm");

    blocks = new bs.BaseBlockstoreImpl(simpleBlockOpts(sthis));
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(cid, asUInt8Array("value", sthis));
      await tblocks.put(cid, asUInt8Array("value", sthis));
      return { head: [] };
    });
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(cid, asUInt8Array("value", sthis));
      await tblocks.put(cid2, asUInt8Array("value2", sthis));
      return { head: [] };
    });
  });
  it("should have transactions", async () =>{
    const ts = blocks.transactions;
    expect(ts.size).toEqual(2);
  });
  it("should get", async () =>{
    const value = (await blocks.get(cid)) as bs.AnyBlock;
    expect(value.cid).toEqual(cid);
    expect(value.bytes.toString()).toEqual(asUInt8Array("value", sthis).toString());

    const value2 = (await blocks.get(cid2)) as bs.AnyBlock;
    expect(value2.bytes.toString()).toEqual(asUInt8Array("value2", sthis).toString());
  });
  it("should yield entries", async () =>{
    const blz = [];
    for await (const blk of blocks.entries()) {
      blz.push(blk);
    }
    expect(blz.length).toEqual(2);
  });
});

// test compact
