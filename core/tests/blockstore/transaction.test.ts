import { CID } from "multiformats";
import { simpleBlockOpts } from "../helpers.js";
import { to_uint8 } from "@adviser/cement";
import { anyBlock2FPBlock, BaseBlockstoreImpl, CarTransactionImpl, EncryptedBlockstore } from "@fireproof/core-blockstore";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { BaseBlockstore, CarTransaction } from "@fireproof/core-types";
import { describe, beforeEach, it, expect, assert } from "vitest";
import { AnyAnyLink, AnyBlock, AnyLink } from "@fireproof/core-types/blockstore";

describe("Fresh TransactionBlockstore", function () {
  let blocks: BaseBlockstore;
  const sthis = ensureSuperThis();
  beforeEach(async () => {
    blocks = new BaseBlockstoreImpl(simpleBlockOpts(sthis));
    await blocks.ready();
  });
  // it("should not have a name", function () {
  //   expect(blocks.name).toBeFalsy();
  // });
  // it("should not have a loader", function () {
  //   expect(blocks.loader).toBeFalsy();
  // });
  it("should not put", async () => {
    const value = sthis.txt.encode("value");
    const e = await blocks.put(await anyBlock2FPBlock({ cid: "key" as unknown as AnyLink, bytes: value })).catch((e) => e);
    expect(e.message).toMatch(/transaction/g);
  });
  it("should yield a transaction", async () => {
    const txR = await blocks.transaction(async (tblocks) => {
      expect(tblocks).toBeTruthy();
      expect(tblocks instanceof CarTransactionImpl).toBeTruthy();
      return { head: [] };
    });
    expect(txR).toBeTruthy();
    expect(txR.t).toBeTruthy();
    expect(txR.meta).toEqual({ head: [] });
  });
});

describe("TransactionBlockstore with name", function () {
  let blocks: EncryptedBlockstore;
  const sthis = ensureSuperThis();
  beforeEach(async () => {
    blocks = new EncryptedBlockstore(sthis, simpleBlockOpts(sthis));
    await blocks.ready();
  });
  // it("should have a name", function () {
  //   expect(blocks.name).toEqual("test");
  // });
  it("should have a loader", function () {
    expect(blocks.loader).toBeTruthy();
  });
  it("should get from loader", async () => {
    const bytes = sthis.txt.encode("bytes");
    expect(blocks.loader).toBeTruthy();
    blocks.loader.getBlock = async (cid) => {
      return anyBlock2FPBlock({ cid, bytes });
    };
    const value = await blocks.get("key" as unknown as AnyAnyLink);
    expect(value).toEqual({ cid: "key" as unknown as AnyAnyLink, bytes });
  });
});

describe("A transaction", function () {
  let tblocks: CarTransaction;
  let blocks: EncryptedBlockstore;
  const sthis = ensureSuperThis();
  beforeEach(async () => {
    blocks = new EncryptedBlockstore(sthis, simpleBlockOpts(sthis, "test"));
    tblocks = new CarTransactionImpl(blocks);
    blocks.transactions.add(tblocks);
  });
  it("should put and get", async () => {
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const bytes = sthis.txt.encode("bytes");
    await tblocks.put(await anyBlock2FPBlock({ cid, bytes }));
    expect(blocks.transactions.has(tblocks)).toBeTruthy();
    const got = await tblocks.get(cid);
    assert(got, "missing block");
    expect(got.cid).toEqual(cid);
    expect(got.bytes).toEqual(bytes);
  });
});

// function asUInt8Array(str: string, sthis: SuperThis) {
//   return sthis.txt.encode(str);
// }

describe("TransactionBlockstore with a completed transaction", function () {
  let blocks: BaseBlockstore;
  let cid: CID;
  let cid2: CID;
  const sthis = ensureSuperThis();

  beforeEach(async () => {
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    cid2 = CID.parse("bafybeibgouhn5ktecpjuovt52zamzvm4dlve5ak7x6d5smms3itkhplnhm");

    blocks = new BaseBlockstoreImpl(simpleBlockOpts(sthis));
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(await anyBlock2FPBlock({ cid, bytes: to_uint8("value") }));
      await tblocks.put(await anyBlock2FPBlock({ cid, bytes: to_uint8("value") }));
      return { head: [] };
    });
    await blocks.transaction(async (tblocks) => {
      await tblocks.put(await anyBlock2FPBlock({ cid, bytes: to_uint8("value") }));
      await tblocks.put(await anyBlock2FPBlock({ cid: cid2, bytes: to_uint8("value2") }));
      return { head: [] };
    });
  });
  it("should have transactions", async () => {
    const ts = blocks.transactions;
    expect(ts.size).toEqual(2);
  });
  it("should get", async () => {
    const value = (await blocks.get(cid)) as AnyBlock;
    expect(value.cid).toEqual(cid);
    expect(value.bytes.toString()).toEqual(to_uint8("value").toString());

    const value2 = (await blocks.get(cid2)) as AnyBlock;
    expect(value2.bytes.toString()).toEqual(to_uint8("value2").toString());
  });
  it("should yield entries", async () => {
    const blz = [];
    for await (const blk of blocks.entries()) {
      blz.push(blk);
    }
    expect(blz.length).toEqual(2);
  });
});

// test compact
