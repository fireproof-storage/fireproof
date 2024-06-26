import { CID } from "multiformats";

import { assert, equals, matches, equalsJSON } from "../helpers.js";
import { EncryptedBlockstore, BaseBlockstore, CarTransaction } from "@fireproof/core/storage-engine";

import { AnyAnyLink, AnyBlock, AnyLink } from "@fireproof/core/storage-engine";

describe("Fresh TransactionBlockstore", function () {
  let blocks: BaseBlockstore;
  beforeEach(function () {
    blocks = new BaseBlockstore();
  });
  it("should not have a name", function () {
    // @ts-expect-error - name is not set on BaseBlockstore
    assert(!blocks.name);
  });
  it("should not have a loader", function () {
    // @ts-expect-error - loader is not set on BaseBlockstore
    assert(!blocks.loader);
  });
  it("should not put", async function () {
    const value = new TextEncoder().encode("value");
    const e = await blocks.put("key" as unknown as AnyLink, value).catch((e) => e);
    matches(e.message, /transaction/g);
  });
  it("should yield a transaction", async function () {
    const txR = await blocks.transaction(async (tblocks) => {
      assert(tblocks);
      assert(tblocks instanceof CarTransaction);
      return { head: [] };
    });
    assert(txR);
    console.log(txR);
    assert(txR.t);
    equalsJSON(txR.meta, { head: [] });
  });
});

describe("TransactionBlockstore with name", function () {
  let blocks: EncryptedBlockstore;
  beforeEach(function () {
    blocks = new EncryptedBlockstore({ name: "test" });
  });
  it("should have a name", function () {
    equals(blocks.name, "test");
  });
  it("should have a loader", function () {
    assert(blocks.loader);
  });
  it("should get from loader", async function () {
    const bytes = new TextEncoder().encode("bytes");
    assert(blocks.loader);
    blocks.loader.getBlock = async (cid) => {
      return { cid, bytes };
    };
    const value = await blocks.get("key" as unknown as AnyAnyLink);
    equalsJSON(value, { cid: "key" as unknown as AnyAnyLink, bytes });
  });
});

describe("A transaction", function () {
  let tblocks: CarTransaction;
  let blocks: EncryptedBlockstore;
  beforeEach(async function () {
    blocks = new EncryptedBlockstore({ name: "test" });
    tblocks = new CarTransaction(blocks);
    blocks.transactions.add(tblocks);
  });
  it("should put and get", async function () {
    const cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    const bytes = new TextEncoder().encode("bytes");
    await tblocks.put(cid, bytes);
    assert(blocks.transactions.has(tblocks));
    const got = await tblocks.get(cid);
    assert(got);
    equals(got.cid, cid);
    equals(got.bytes, bytes);
  });
});

function asUInt8Array(str: string) {
  return new TextEncoder().encode(str);
}

describe("TransactionBlockstore with a completed transaction", function () {
  let blocks: BaseBlockstore;
  let cid: CID;
  let cid2: CID;

  beforeEach(async function () {
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    cid2 = CID.parse("bafybeibgouhn5ktecpjuovt52zamzvm4dlve5ak7x6d5smms3itkhplnhm");

    blocks = new BaseBlockstore();
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
    equals(ts.size, 2);
  });
  it("should get", async function () {
    const value = (await blocks.get(cid)) as AnyBlock;
    equals(value.cid, cid);
    equals(value.bytes.toString(), asUInt8Array("value").toString());

    const value2 = (await blocks.get(cid2)) as AnyBlock;
    equals(value2.bytes.toString(), asUInt8Array("value2").toString());
  });
  it("should yield entries", async function () {
    const blz = [];
    for await (const blk of blocks.entries()) {
      blz.push(blk);
    }
    equals(blz.length, 2);
  });
});

// test compact
