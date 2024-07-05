import { CID } from "multiformats";
// import { matches, equalsJSON } from "../helpers.js";
import { bs } from "@fireproof/core";

describe("Fresh TransactionBlockstore", function () {
  let blocks: bs.BaseBlockstore;
  beforeEach(function () {
    blocks = new bs.BaseBlockstore();
  });
  it("should not have a name", function () {
    expect(blocks.name).toBeFalsy();
  });
  it("should not have a loader", function () {
    expect(blocks.loader).toBeFalsy();
  });
  it("should not put", async function () {
    const value = new TextEncoder().encode("value");
    const e = await blocks.put("key" as unknown as bs.AnyLink, value).catch((e) => e);
    expect(e.message).toMatch(/transaction/g);
  });
  it("should yield a transaction", async function () {
    const txR = await blocks.transaction(async (tblocks) => {
      expect(tblocks).toBeTruthy();
      expect(tblocks instanceof bs.CarTransaction).toBeTruthy();
      return { head: [] };
    });
    expect(txR).toBeTruthy();
    expect(txR.t).toBeTruthy();
    expect(txR.meta).toEqual({ head: [] });
  });
});

describe("TransactionBlockstore with name", function () {
  let blocks: bs.EncryptedBlockstore;
  beforeEach(function () {
    blocks = new bs.EncryptedBlockstore({ name: "test" });
  });
  it("should have a name", function () {
    expect(blocks.name).toEqual("test");
  });
  it("should have a loader", function () {
    expect(blocks.loader).toBeTruthy();
  });
  it("should get from loader", async function () {
    const bytes = new TextEncoder().encode("bytes");
    expect(blocks.loader).toBeTruthy();
    blocks.loader.getBlock = async (cid) => {
      return { cid, bytes };
    };
    const value = await blocks.get("key" as unknown as bs.AnyAnyLink);
    expect(value).toEqual({ cid: "key" as unknown as bs.AnyAnyLink, bytes });
  });
});

describe("A transaction", function () {
  let tblocks: bs.CarTransaction;
  let blocks: bs.EncryptedBlockstore;
  beforeEach(async function () {
    blocks = new bs.EncryptedBlockstore({ name: "test" });
    tblocks = new bs.CarTransaction(blocks);
    blocks.transactions.add(tblocks);
  });
  it("should put and get", async function () {
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const bytes = new TextEncoder().encode("bytes");
    await tblocks.put(cid, bytes);
    expect(blocks.transactions.has(tblocks)).toBeTruthy();
    const got = await tblocks.get(cid);
    expect(got).toBeTruthy();
    expect(got?.cid).toEqual(cid);
    expect(got?.bytes).toEqual(bytes);
  });
});

function asUInt8Array(str: string) {
  return new TextEncoder().encode(str);
}

describe("TransactionBlockstore with a completed transaction", function () {
  let blocks: bs.BaseBlockstore;
  let cid: CID;
  let cid2: CID;

  beforeEach(async function () {
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    cid2 = CID.parse("bafybeibgouhn5ktecpjuovt52zamzvm4dlve5ak7x6d5smms3itkhplnhm");

    blocks = new bs.BaseBlockstore();
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(cid, asUInt8Array("value"));
      await tblocks.put(cid2, asUInt8Array("value2"));
      return { head: [] };
    });
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(cid, asUInt8Array("value"));
      await tblocks.put(cid2, asUInt8Array("value2"));
      return { head: [] };
    });
  });
  it("should have transactions", async function () {
    const ts = blocks.transactions;
    expect(ts.size).toEqual(2);
  });
  it("should get", async function () {
    const value = (await blocks.get(cid)) as bs.AnyBlock;
    expect(value.cid).toEqual(cid);
    expect(value.bytes.toString()).toEqual(asUInt8Array("value").toString());

    const value2 = (await blocks.get(cid2)) as bs.AnyBlock;
    expect(value2.bytes.toString()).toEqual(asUInt8Array("value2").toString());
  });
  it("should yield entries", async function () {
    const blz = [];
    for await (const blk of blocks.entries()) {
      blz.push(blk);
    }
    expect(blz.length).toEqual(2);
  });
});

// test compact
