import { CID } from "multiformats";

import { assert, equals, matches, equalsJSON } from "../fireproof/helpers.js";
import { EncryptedBlockstore as Blockstore, CarTransaction } from "../../src/storage-engine/index.js";

import { AnyAnyLink, AnyBlock, AnyLink } from "../../src/storage-engine/types.js";

describe("Fresh TransactionBlockstore", function () {
  let blocks: Blockstore;
  beforeEach(function () {
    blocks = new Blockstore({});
  });
  it("should not have a name", function () {
    assert(!blocks.name);
  });
  it("should not have a loader", function () {
    assert(!blocks._loader);
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
    equalsJSON(txR, { head: [] });
  });
});

describe("TransactionBlockstore with name", function () {
  let blocks: Blockstore
  beforeEach(function () {
    blocks = new Blockstore({ name: "test" });
  });
  it("should have a name", function () {
    equals(blocks.name, "test");
  });
  it("should have a loader", function () {
    assert(blocks.loader);
  });
  it("should get from loader", async function () {
    const bytes = new TextEncoder().encode("bytes");
    assert(blocks.loader)
    blocks.loader.getBlock = async (cid) => {
      return { cid, bytes };
    };
    const value = await blocks.get("key" as unknown as AnyAnyLink);
    equalsJSON(value, { cid: "key" as unknown as AnyAnyLink, bytes });
  });
});

describe("A transaction", function () {
  let tblocks: CarTransaction
  let blocks: Blockstore;
  beforeEach(async function () {
    blocks = new Blockstore({});
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
  let blocks: Blockstore
  let cid: CID
  let cid2: CID

  beforeEach(async function () {
    cid = CID.parse("bafybeia4luuns6dgymy5kau5rm7r4qzrrzg6cglpzpogussprpy42cmcn4");
    cid2 = CID.parse("bafybeibgouhn5ktecpjuovt52zamzvm4dlve5ak7x6d5smms3itkhplnhm");

    blocks = new Blockstore({});
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
    const value = await blocks.get(cid) as AnyBlock;
    equals(value.cid, cid);
    equals(value.bytes.toString(), asUInt8Array("value").toString());

    const value2 = await blocks.get(cid2) as AnyBlock;
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
