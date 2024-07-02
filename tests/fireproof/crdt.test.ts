import { assert, equals, matches, notEquals, itSkip } from "../helpers.js";

import { uuidv4 } from "uuidv7";

import { CRDT } from "@fireproof/core";
import { parseCarFile } from "@fireproof/core/storage-engine";
import { CRDTMeta, DocValue } from "@fireproof/core";
import { Index, index } from "@fireproof/core";
import { AnyBlock, EncryptedBlockstore, Loader } from "@fireproof/core/storage-engine";
import { SysContainer } from "@fireproof/core/runtime";


describe("Fresh crdt", function () {
  let crdt: CRDT<{ hello: string } | { points: number }>;
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT()
  });
  it("should have an empty head", async function () {
    const head = crdt.clock.head;
    equals(head.length, 0);
  });
  it("should accept put and return results", async function () {
    const didPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
    const head = didPut.head;
    equals(head.length, 1);
  });
  it("should accept multi-put and return results", async function () {
    const didPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    const head = didPut.head;
    equals(head.length, 1);
  });
});

describe("CRDT with one record", function () {
  interface CRDTTestType {
    readonly hello: string;
    readonly nice: string;
  }
  let crdt: CRDT<Partial<CRDTTestType>>;
  let firstPut: CRDTMeta;

  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })

  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT(`test@${uuidv4()}`);
    firstPut = await crdt.bulk([{ id: "hello", value: { hello: "world" } }]);
  });
  it("should have a one-element head", async function () {
    const head = crdt.clock.head;
    equals(head.length, 1);
  });
  it("should return the head", async function () {
    equals(firstPut.head.length, 1);
  });
  it("return the record on get", async function () {
    const got = await crdt.get("hello");
    assert(got);
    equals(got.doc.hello, "world");
  });
  it("should accept another put and return results", async function () {
    const didPut = await crdt.bulk([{ id: "nice", value: { nice: "data" } }]);
    const head = didPut.head;
    equals(head.length, 1);
    const { doc } = await crdt.get("nice") as DocValue<CRDTTestType>;
    equals(doc.nice, "data");
  });
  it("should allow for a delete", async function () {
    const didDel = await crdt.bulk([{ id: "hello", del: true }]);
    assert(didDel.head);
    const got = await crdt.get("hello");
    assert(!got);
  });
  it("should offer changes", async function () {
    const { result } = await crdt.changes([]);
    equals(result.length, 1);
    equals(result[0].id, "hello");
    equals(result[0].value?.hello, "world");
  });
});

describe("CRDT with a multi-write", function () {
  interface CRDTTestType {
    readonly points: number;
  }
  let crdt: CRDT<CRDTTestType>;
  let firstPut: CRDTMeta;

  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT();
    firstPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
  });
  it("should have a one-element head", async function () {
    const head = crdt.clock.head;
    equals(head.length, 1);
    equals(firstPut.head.length, 1);
  });
  it("return the records on get", async function () {
    const { doc } = await crdt.get("ace") as DocValue<CRDTTestType>;
    equals(doc.points, 11);

    const got2 = await crdt.get("king");
    assert(got2);
    equals(got2.doc.points, 10);
  });
  it("should accept another put and return results", async function () {
    const didPut = await crdt.bulk([{ id: "queen", value: { points: 10 } }]);
    const head = didPut.head;
    equals(head.length, 1);
    const got = await crdt.get("queen");
    assert(got);
    equals(got.doc.points, 10);
  });
  it("should offer changes", async function () {
    const { result } = await crdt.changes([]);
    equals(result.length, 2);
    equals(result[0].id, "ace");
    equals(result[0].value?.points, 11);
    equals(result[1].id, "king");
  });
  it("should offer changes since", async function () {
    /** @type {CRDTMeta} */
    const secondPut = await crdt.bulk([
      { id: "queen", value: { points: 10 } },
      { id: "jack", value: { points: 10 } },
    ]);
    assert(secondPut.head);
    const { result: r2, head: h2 } = await crdt.changes();
    equals(r2.length, 4);
    const { result: r3 } = await crdt.changes(firstPut.head);
    equals(r3.length, 2);
    const { result: r4 } = await crdt.changes(h2);
    equals(r4.length, 0);
  });
});

interface CRDTTestType {
  readonly points: number;
}
describe("CRDT with two multi-writes", function () {
  /** @type {CRDT} */
  let crdt: CRDT<CRDTTestType>;
  let firstPut: CRDTMeta;
  let secondPut: CRDTMeta;
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async () => {
    await SysContainer.start();
    crdt = new CRDT();
    firstPut = await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    secondPut = await crdt.bulk([
      { id: "queen", value: { points: 10 } },
      { id: "jack", value: { points: 10 } },
    ]);
  });
  it("should have a one-element head", async function () {
    const head = crdt.clock.head;
    equals(head.length, 1);
    equals(firstPut.head.length, 1);
    equals(secondPut.head.length, 1);
    notEquals(firstPut.head[0], secondPut.head[0]);
  });
  it("return the records on get", async function () {
    const ret = await crdt.get("ace");
    expect(ret).not.toBeNull();
    const { doc } = ret as DocValue<CRDTTestType>;
    equals(doc.points, 11);

    for (const key of ["king", "queen", "jack"]) {
      const { doc } = await crdt.get(key) as DocValue<CRDTTestType>;
      equals(doc.points, 10);
    }
  });
  it("should offer changes", async function () {
    const { result } = await crdt.changes();
    equals(result.length, 4);
    equals(result[0].id, "ace");
    equals(result[0].value?.points, 11);
    equals(result[1].id, "king");
    equals(result[2].id, "queen");
    equals(result[3].id, "jack");
  });
});

describe("Compact a named CRDT with writes", function () {
  let crdt: CRDT<CRDTTestType>;
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT("named-crdt-compaction");
    for (let i = 0; i < 10; i++) {
      const bulk = [
        { id: "ace", value: { points: 11 } },
        { id: "king", value: { points: 10 } },
      ];
      await crdt.bulk(bulk);
    }
  });
  it("has data", async function () {
    const got = await crdt.get("ace") as DocValue<CRDTTestType>;
    assert(got.doc);
    equals(got.doc.points, 11);
  });
  it("should start with blocks", async function () {
    const blz: AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    equals(blz.length, 13);
  });
  it("should start with changes", async function () {
    const { result } = await crdt.changes();
    equals(result.length, 2);
    equals(result[0].id, "ace");
  });
  itSkip("should have fewer blocks after compact", async function () {
    await crdt.compact();
    const blz: AnyBlock[] = [];
    for await (const blk of crdt.blockstore.entries()) {
      blz.push(blk);
    }
    equals(blz.length, 23);
  });
  it("should have data after compact", async function () {
    await crdt.compact();
    const got = await crdt.get("ace") as DocValue<CRDTTestType>;
    assert(got.doc);
    equals(got.doc.points, 11);
  });
  it("should have changes after compact", async function () {
    const chs = await crdt.changes();
    equals(chs.result[0].id, "ace");
  });
});

describe("CRDT with an index", function () {
  let crdt: CRDT<CRDTTestType>;
  let idx: Index<number, CRDTTestType>;
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT<CRDTTestType>();
    await crdt.bulk([
      { id: "ace", value: { points: 11 } },
      { id: "king", value: { points: 10 } },
    ]);
    idx = await index<number, CRDTTestType>({ _crdt: crdt }, "points");
  });
  it("should query the data", async function () {
    const got = await idx.query({ range: [9, 12] });
    equals(got.rows.length, 2);
    equals(got.rows[0].id, "king");
    equals(got.rows[0].key, 10);

  });
  it("should register the index", async function () {
    const rIdx = await index<number, CRDTTestType>({ _crdt: crdt }, "points");
    assert(rIdx);
    equals(rIdx.name, "points");
    const got = await rIdx.query({ range: [9, 12] });
    equals(got.rows.length, 2);
    equals(got.rows[0].id, "king");
    equals(got.rows[0].key, 10);

  });
  it("creating a different index with same name should not work", async function () {
    const e = await index({ _crdt: crdt }, "points", (doc) => doc._id)
      .query()
      .catch((err) => err);
    matches(e.message, /cannot apply/);
  });
});

describe("Loader with a committed transaction", function () {
  interface CRDTTestType {
    readonly foo: string;
  }
  let loader: Loader;
  let blockstore: EncryptedBlockstore;
  let crdt: CRDT<CRDTTestType>;
  let done: CRDTMeta;
  const dbname = "test-loader";
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT(dbname);
    blockstore = crdt.blockstore as EncryptedBlockstore;
    if (!blockstore.loader) { throw new Error("no loader"); }
    loader = blockstore.loader;
    done = await crdt.bulk([{ id: "foo", value: { foo: "bar" } }]);
  });
  it("should have a name", function () {
    equals(loader.name, dbname);
  });
  it("should commit a transaction", function () {
    assert(done.head);
    // assert(done.cars);
    equals(loader.carLog.length, 1);
  });
  it("can load the car", async function () {
    const blk = loader.carLog[0][0];
    assert(blk);
    const reader = await loader.loadCar(blk);
    assert(reader);
    const parsed = await parseCarFile<CRDTMeta>(reader);
    assert(parsed.cars);
    equals(parsed.cars.length, 0);
    assert(parsed.meta);
    assert(parsed.meta.head);
  });
});

describe("Loader with two committed transactions", function () {
  interface CRDTTestType {
    readonly foo: string;
  }
  let loader: Loader
  let crdt: CRDT<CRDTTestType>;
  let blockstore: EncryptedBlockstore;
  let done1: CRDTMeta
  let done2: CRDTMeta
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT("test-loader");
    blockstore = crdt.blockstore as EncryptedBlockstore;
    if (!blockstore.loader) { throw new Error("no loader"); }
    loader = blockstore.loader;
    done1 = await crdt.bulk([{ id: "apple", value: { foo: "bar" } }]);
    done2 = await crdt.bulk([{ id: "orange", value: { foo: "bar" } }]);
  });
  it("should commit two transactions", function () {
    assert(done1.head);
    // assert(done1.cars);
    assert(done2.head);
    // assert(done2.cars);
    notEquals(done1.head, done2.head);
    // notEquals(done1.cars, done2.cars);
    // equals(blockstore.transactions.size, 2)
    equals(loader.carLog.length, 2);
    //equals(loader.carLog.indexOf(done1.cars), 1)
    // equals(loader.carLog.map((cs) => cs.toString()).indexOf(done1.cars.toString()), 1);
    //equals(loader.carLog.indexOf(done2.cars), 0)
    // equals(loader.carLog.map((cs) => cs.toString()).indexOf(done2.cars.toString()), 0);
  });
  it("can load the car", async function () {
    const blk = loader.carLog[0][0];
    assert(blk);
    const reader = await loader.loadCar(blk);
    assert(reader);
    const parsed = await parseCarFile<CRDTMeta>(reader);
    assert(parsed.cars);
    equals(parsed.cars.length, 1);
    assert(parsed.meta);
    assert(parsed.meta.head);
  });
});

describe("Loader with many committed transactions", function () {
  interface Doc { foo: string }
  let loader: Loader
  let blockstore: EncryptedBlockstore
  let crdt: CRDT<Doc>
  let dones: CRDTMeta[]
  const count = 10;
  afterEach(async function () {
    await crdt.close();
    await crdt.destroy();
  })
  beforeEach(async function () {
    await SysContainer.start();
    crdt = new CRDT("test-loader-many");
    blockstore = crdt.blockstore as EncryptedBlockstore;
    if (!blockstore.loader) { throw new Error("no loader"); }
    loader = blockstore.loader;
    dones = [];
    for (let i = 0; i < count; i++) {
      const did = await crdt.bulk([{ id: `apple${i}`, value: { foo: "bar" } }]);
      dones.push(did);
    }
  });
  it("should commit many transactions", function () {
    for (const done of dones) {
      assert(done.head);
      // assert(done.cars);
    }
    equals(blockstore.transactions.size, 0); // cleaned up on commit
    equals(loader.carLog.length, count);
  });
  it("can load the car", async function () {
    const blk = loader.carLog[2][0];
    // assert(dones[5].cars);
    const reader = await loader.loadCar(blk);
    assert(reader);
    const parsed = await parseCarFile<CRDTMeta>(reader);
    assert(parsed.cars);
    equals(parsed.cars.length, 7);
    assert(parsed.meta);
    assert(parsed.meta.head);
  });
});
