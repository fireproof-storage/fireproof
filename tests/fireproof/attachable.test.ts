import { URI } from "@adviser/cement";
import { stripper } from "@adviser/cement/utils";
import { Attachable, Database, ensureSuperThis, fireproof, GatewayUrlsParam, PARAM, rt, Attached, bs } from "@fireproof/core";
import { CarReader } from "@ipld/car/reader";
import * as dagCbor from "@ipld/dag-cbor";
import { sleep } from "../helpers.js";
import { mockLoader } from "../helpers.js";

describe("meta check", () => {
  const sthis = ensureSuperThis();
  it("empty Database", async () => {
    const name = `remote-db-${sthis.nextId().str}`;
    const db = fireproof(name, {
      storeUrls: {
        base: `memory://${name}`,
      },
    });
    await db.ready();
    const gws = db.ledger.crdt.blockstore.loader.attachedStores.local();
    await db.close();
    expect(
      Array.from(((gws.active.car.realGateway as rt.gw.DefSerdeGateway).gw as rt.gw.memory.MemoryGateway).memorys.entries()).filter(
        ([k]) => k.startsWith(`memory://${name}`),
      ),
    ).toEqual([]);
  });

  it("one record Database", async () => {
    const name = `remote-db-${sthis.nextId().str}`;
    const db = fireproof(name, {
      storeUrls: {
        base: `memory://${name}`,
      },
    });
    await db.put({ _id: `id-${0}`, value: `value-${0}` });
    await db.close();

    const db1 = fireproof(name, {
      storeUrls: {
        base: `memory://${name}`,
      },
    });
    await db1.close();
  });

  it("multiple record Database", async () => {
    const name = `remote-db-${sthis.nextId().str}`;
    const base = `memory://${name}?storekey=insecure`;
    const db = fireproof(name, {
      storeUrls: {
        base,
      },
    });
    await db.ready();
    await db.put({ _id: `id-${0}`, value: `value-${0}` });
    const gws = db.ledger.crdt.blockstore.loader.attachedStores.local();
    expect(db.ledger.crdt.blockstore.loader.carLog.asArray().map((i) => i.map((i) => i.toString()))).toEqual([
      ["baembeieldbalgnyxqp7rmj4cbrot75gweavqy3aw22km43zsfufrihfn7e"],
      ["baembeig2is4vdgz4gyiadfh5uutxxeiuqtacnesnytrnilpwcu7q5m5tmu"],
    ]);
    await db.close();
    expect(
      Array.from(((gws.active.car.realGateway as rt.gw.DefSerdeGateway).gw as rt.gw.memory.MemoryGateway).memorys.entries())
        .filter(([k]) => k.startsWith(`memory://${name}`))
        .map(([k]) =>
          stripper(
            ["name", "storekey", "version"],
            Array.from(URI.from(k).getParams).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
          ),
        ),
    ).toEqual([
      {
        key: "baembeig2is4vdgz4gyiadfh5uutxxeiuqtacnesnytrnilpwcu7q5m5tmu",
        store: "car",
        suffix: ".car",
      },
      {
        key: "main",
        store: "wal",
      },
      {
        key: "main",
        store: "meta",
      },
      {
        key: "baembeieldbalgnyxqp7rmj4cbrot75gweavqy3aw22km43zsfufrihfn7e",
        store: "car",
        suffix: ".car",
      },
    ]);

    const db1 = fireproof(name, {
      storeUrls: {
        base,
      },
    });
    expect(db1.ledger).not.equal(db.ledger);
    await db1.ready();
    expect(db1.ledger.crdt.blockstore.loader.carLog.asArray().map((i) => i.map((i) => i.toString()))).toEqual([
      ["baembeieldbalgnyxqp7rmj4cbrot75gweavqy3aw22km43zsfufrihfn7e"],
      ["baembeig2is4vdgz4gyiadfh5uutxxeiuqtacnesnytrnilpwcu7q5m5tmu"],
    ]);

    const gensis = await db1.get(PARAM.GENESIS_CID);
    expect(gensis).toEqual({ _id: PARAM.GENESIS_CID });

    const val = await db1.allDocs();
    expect(val.rows).toEqual([
      {
        key: "id-0",
        value: {
          _id: "id-0",
          value: "value-0",
        },
      },
    ]);
    const car = Array.from(
      ((gws.active.car.realGateway as rt.gw.DefSerdeGateway).gw as rt.gw.memory.MemoryGateway).memorys.entries(),
    )
      .filter(([k]) => k.startsWith(`memory://${name}`))
      .map(([k, v]) => [URI.from(k).getParam(PARAM.KEY), v])
      .find(([k]) => k === "baembeig2is4vdgz4gyiadfh5uutxxeiuqtacnesnytrnilpwcu7q5m5tmu") as [string, Uint8Array];
    const rawReader = await CarReader.fromBytes(car[1]);
    const blocks = [];
    for await (const block of rawReader.blocks()) {
      blocks.push(block);
    }
    expect(dagCbor.decode(blocks[1].bytes)).toEqual({
      doc: {
        _id: "baembeiarootfireproofgenesisblockaaaafireproofgenesisblocka",
      },
    });

    expect(blocks.map((i) => i.cid.toString())).toEqual([
      "bafyreibxibqhi6wh5klrje7ne4htffeqyyqfd6y7x2no6wnhid4nixizau",
      "bafyreidnvv4mwvweup5w52ddre2sl4syhvczm6ejqsmuekajowdl2cf2q4",
      "bafyreihh6nbfbhgkf5lz7hhsscjgiquw426rxzr3fprbgonekzmyvirrhe",
      "bafyreiejg3twlaxr7gfvvhtxrhvwaydytdv4guidmtvaz5dskm6gp73ryi",
      "bafyreiblui55o25dopc5faol3umsnuohb5carto7tot4kicnkfc37he4h4",
    ]);
  });
});

describe("activate store", () => {
  // activate(store: DataAndMetaStore | CoerceURI): ActiveStore {
  //   if (isCoerceURI(store)) {
  //     throw this.loadable.sthis.logger.Error().Msg("store must be an object").AsError();
  //   }
  //   return new ActiveStoreImpl(store as DataAndMetaStore, this);
  // }

  const sthis = ensureSuperThis();
  let attach: bs.AttachedStores;
  let firstAttached: Attached;
  let secondAttached: Attached;
  beforeEach(async () => {
    attach = new bs.AttachedRemotesImpl(mockLoader(sthis));
    firstAttached = await attach.attach({
      name: "first",
      prepare: async () => ({
        car: { url: "memory://first?store=car" },
        meta: { url: "memory://first?store=meta" },
        file: { url: "memory://first" },
        wal: { url: "memory://first?store=wal" },
      }),
    });

    secondAttached = await attach.attach({
      name: "second",
      prepare: async () => ({
        car: { url: "memory://second?store=car" },
        meta: { url: "memory://second?store=meta" },
        file: { url: "memory://second?store=file" },
      }),
    });
  });

  it("activate by store", async () => {
    expect(attach.activate(secondAttached.stores).active.car.url().toString()).toBe(
      "memory://second?name=second&store=car&storekey=%40second-data%40&suffix=.car&version=v0.19-memory",
    );
    expect(attach.activate(firstAttached.stores).local().active.car.url().toString()).toBe(
      "memory://first?name=first&store=car&storekey=%40first-data%40&suffix=.car&version=v0.19-memory",
    );
    expect(attach.activate(firstAttached.stores).active.meta.url().toString()).toBe(
      "memory://first?name=first&store=meta&storekey=%40first-meta%40&version=v0.19-memory",
    );
  });

  it("activate by store", async () => {
    expect(attach.activate("memory://second").active.car.url().toString()).toBe(
      "memory://second?name=second&store=car&storekey=%40second-data%40&suffix=.car&version=v0.19-memory",
    );
    expect(attach.activate("memory://second").remotes()[0].active.car.url().toString()).toEqual(
      "memory://second?name=second&store=car&storekey=%40second-data%40&suffix=.car&version=v0.19-memory",
    );
    expect(attach.activate("memory://first?store=meta").active.car.url().toString()).toBe(
      "memory://first?name=first&store=car&storekey=%40first-data%40&suffix=.car&version=v0.19-memory",
    );
  });
});

describe("join function", () => {
  const sthis = ensureSuperThis();
  // export const connect: ConnectFunction = (
  //     db: Database,
  //     remoteDbName = "",
  //     url = "netlify://localhost:8888?protocol=ws"
  //   ) => {
  //     const { sthis, name: dbName } = db;
  //     if (!dbName) {
  //       throw new Error("dbName is required");
  //     }
  //     const urlObj = BuildURI.from(url);
  //     const existingName = urlObj.getParam("name");
  //     urlObj.defParam("name", remoteDbName || existingName || dbName);
  //     urlObj.defParam("localName", dbName);
  //     urlObj.defParam("storekey", `@${dbName}:data@`);
  //     return connectionCache.get(urlObj.toString()).once(() => {
  //       makeKeyBagUrlExtractable(sthis);
  //       const connection = connectionFactory(sthis, urlObj);
  //       connection.connect(db.ledger.crdt.blockstore);
  //       return connection;
  //     });
  //   };
  class AJoinable implements Attachable {
    readonly name: string;
    constructor(name: string) {
      this.name = name;
    }
    prepare(): Promise<GatewayUrlsParam> {
      return Promise.resolve({
        car: { url: `memory://car/${this.name}` },
        meta: { url: `memory://meta/${this.name}` },
        file: { url: `memory://file/${this.name}` },
      });
    }
  }
  function aJoinable(name: string): Attachable {
    return new AJoinable(name);
  }

  let db: Database;
  let joinableDBs: string[] = [];
  beforeAll(async () => {
    const set = sthis.nextId().str;
    joinableDBs = await Promise.all(
      new Array(10).fill(1).map(async (_, i) => {
        const name = `remote-db-${i}-${set}`;
        const db = fireproof(name, {
          storeUrls: {
            // base: `memory://${name}`,
            data: {
              car: `memory://car/${name}`,
              meta: `memory://meta/${name}`,
              file: `memory://file/${name}`,
              wal: `memory://wal/${name}`,
            },
          },
        });
        // await db.put({ _id: `genesis`, value: `genesis` });
        // await db.ready();
        for (let j = 0; j < 10; j++) {
          await db.put({ _id: `${i}-${j}`, value: `${i}-${j}` });
        }
        expect(await db.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
        await db.close();
        return name;
      }),
    );
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    db = fireproof(`db-${set}`, {
      storeUrls: {
        base: `memory://db-${set}`,
      },
    });
    // await db.put({ _id: `genesis`, value: `genesis` });
    for (let j = 0; j < 10; j++) {
      await db.put({ _id: `db-${j}`, value: `db-${set}` });
    }
    expect(await db.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
  });
  afterAll(async () => {
    await db.close();
  });

  it("it is joinable detachable", async () => {
    const my = fireproof("my", {
      storeUrls: {
        base: "memory://my",
      },
    });
    await my.put({ _id: "genesis", value: "genesis" });
    await Promise.all(
      joinableDBs.map(async (name) => {
        const tmp = fireproof(name, {
          storeUrls: {
            data: {
              car: `memory://car/${name}`,
              meta: `memory://meta/${name}`,
              file: `memory://file/${name}`,
              wal: `memory://wal/${name}`,
            },
          },
        });
        const res = await tmp.allDocs();
        expect(res.rows.length).toBe(10);
        await tmp.close();
        const attached = await my.attach(aJoinable(name));
        expect(attached).toBeDefined();
      }),
    );
    expect(my.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
    await my.close();
    expect(my.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(0);
  });

  it("it is inbound syncing", async () => {
    await Promise.all(
      joinableDBs.map(async (name) => {
        const attached = await db.attach(aJoinable(name));
        expect(attached).toBeDefined();
      }),
    );
    await sleep(100);
    expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
    const res = await db.allDocs();
    expect(res.rows.length).toBe(10 + 10 * joinableDBs.length);
  });

  it("it empty inbound syncing", async () => {
    const name = `empty-db-${sthis.nextId().str}`;
    const db = fireproof(name, {
      storeUrls: {
        // base: `memory://${name}`,
        data: {
          car: `memory://car/${name}`,
          meta: `memory://meta/${name}`,
          file: `memory://file/${name}`,
          wal: `memory://wal/${name}`,
        },
      },
    });
    await Promise.all(
      joinableDBs.map(async (name) => {
        const attached = await db.attach(aJoinable(name));
        expect(attached).toBeDefined();
      }),
    );
    await sleep(100);
    expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
    const res = await db.allDocs();
    expect(res.rows.length).toBe(10 * joinableDBs.length);
  });
});
