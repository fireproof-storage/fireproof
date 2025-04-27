import { AppContext, BuildURI, URI, WithoutPromise } from "@adviser/cement";
import { stripper } from "@adviser/cement/utils";
import {
  Attachable,
  Database,
  ensureSuperThis,
  fireproof,
  GatewayUrlsParam,
  PARAM,
  rt,
  Attached,
  bs,
  sleep,
  TraceFn,
} from "@fireproof/core";
import { CarReader } from "@ipld/car/reader";
import * as dagCbor from "@ipld/dag-cbor";
import { mockLoader } from "../helpers.js";
import { afterEach, beforeEach, expect } from "vitest";

const ROWS = 1;

class AJoinable implements Attachable {
  readonly name: string;
  readonly db: Database;

  constructor(name: string, db: Database) {
    this.name = name;
    this.db = db;
  }

  async configHash() {
    return `joinable-${this.name}`;
  }

  prepare(): Promise<GatewayUrlsParam> {
    return Promise.resolve({
      car: {
        url: BuildURI.from(`memory://car/${this.name}`)
          .setParam(PARAM.STORE_KEY, this.db.ledger.opts.storeUrls.data.car.getParam(PARAM.STORE_KEY, "@fireproof:attach@"))
          .setParam(PARAM.SELF_REFLECT, "x"),
      },
      meta: {
        url: BuildURI.from(`memory://meta/${this.name}`)
          .setParam(PARAM.STORE_KEY, this.db.ledger.opts.storeUrls.data.meta.getParam(PARAM.STORE_KEY, "@fireproof:attach@"))
          .setParam(PARAM.SELF_REFLECT, "x"),
      },
      file: {
        url: BuildURI.from(`memory://file/${this.name}`)
          .setParam(PARAM.STORE_KEY, this.db.ledger.opts.storeUrls.data.file.getParam(PARAM.STORE_KEY, "@fireproof:attach@"))
          .setParam(PARAM.SELF_REFLECT, "x"),
      },
    });
  }
}

function aJoinable(name: string, db: Database): Attachable {
  return new AJoinable(name, db);
}

function attachableStoreUrls(name: string, db: Database) {
  return {
    // base: `memory://${name}`,
    data: {
      car: BuildURI.from(`memory://car/${name}?`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.car.getParam(PARAM.STORE_KEY, ""))
        .URI(),
      meta: BuildURI.from(`memory://meta/${name}`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.meta.getParam(PARAM.STORE_KEY, ""))
        .URI(),
      file: BuildURI.from(`memory://file/${name}`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.file.getParam(PARAM.STORE_KEY, ""))
        .URI(),
      wal: BuildURI.from(`memory://wal/${name}`)
        .setParam(PARAM.STORE_KEY, db.ledger.opts.storeUrls.data.wal.getParam(PARAM.STORE_KEY, ""))
        .URI(),
    },
  };
}

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
      Array.from(
        ((gws.active.car.realGateway as rt.gw.DefSerdeGateway).gw as rt.gw.memory.MemoryGateway).memories.entries(),
      ).filter(([k]) => k.startsWith(`memory://${name}`)),
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
      Array.from(((gws.active.car.realGateway as rt.gw.DefSerdeGateway).gw as rt.gw.memory.MemoryGateway).memories.entries())
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
      ((gws.active.car.realGateway as rt.gw.DefSerdeGateway).gw as rt.gw.memory.MemoryGateway).memories.entries(),
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
    firstAttached = await attach.attach(
      {
        name: "first",
        configHash: async () => "first",
        prepare: async () => ({
          car: { url: "memory://first?store=car" },
          meta: { url: "memory://first?store=meta" },
          file: { url: "memory://first" },
          wal: { url: "memory://first?store=wal" },
        }),
      },
      (at) => Promise.resolve(at),
    );

    secondAttached = await attach.attach(
      {
        name: "second",
        configHash: async () => "second",
        prepare: async () => ({
          car: { url: "memory://second?store=car" },
          meta: { url: "memory://second?store=meta" },
          file: { url: "memory://second?store=file" },
        }),
      },
      (at) => Promise.resolve(at),
    );
  });

  it("activate by store", async () => {
    expect(attach.activate(secondAttached.stores).active.car.url().toString()).toBe(
      "memory://second?localName=first&name=second&store=car&storekey=%40first-data%40&suffix=.car&version=v0.19-memory",
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
      "memory://second?localName=first&name=second&store=car&storekey=%40first-data%40&suffix=.car&version=v0.19-memory",
    );
    expect(attach.activate("memory://second").remotes()[0].active.car.url().toString()).toEqual(
      "memory://second?localName=first&name=second&store=car&storekey=%40first-data%40&suffix=.car&version=v0.19-memory",
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

  let db: Database;
  let joinableDBs: string[] = [];
  beforeEach(async () => {
    const set = sthis.nextId().str;

    db = fireproof(`db-${set}`, {
      storeUrls: {
        base: `memory://db-${set}`,
      },
    });
    // await db.put({ _id: `genesis`, value: `genesis` });
    for (let j = 0; j < ROWS; j++) {
      await db.put({ _id: `db-${j}`, value: `db-${set}` });
    }

    joinableDBs = await Promise.all(
      new Array(1).fill(1).map(async (_, i) => {
        const name = `remote-db-${i}-${set}`;
        const jdb = fireproof(name, {
          storeUrls: attachableStoreUrls(name, db),
        });
        // await db.put({ _id: `genesis`, value: `genesis` });
        // await db.ready();
        for (let j = 0; j < ROWS; j++) {
          await jdb.put({ _id: `${i}-${j}`, value: `${i}-${j}` });
        }
        expect(await jdb.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
        await jdb.close();
        return name;
      }),
    );
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(await db.get(PARAM.GENESIS_CID)).toEqual({ _id: PARAM.GENESIS_CID });
  });
  afterEach(async () => {
    await db.close();
  });

  it("it is joinable detachable", async () => {
    const my = fireproof("my", {
      storeUrls: {
        base: BuildURI.from("memory://it-is-joinable-detachable").setParam(
          PARAM.STORE_KEY,
          db.ledger.opts.storeUrls.data.car.getParam(PARAM.STORE_KEY, ""),
        ), // .setParam(PARAM.STORE_KEY, "@fireproof:attach@"),
      },
    });
    await my.put({ _id: "genesis", value: "genesis" });
    await Promise.all(
      joinableDBs.map(async (name) => {
        const tmp = fireproof(name, {
          storeUrls: attachableStoreUrls(name, my),
        });
        const res = await tmp.allDocs();
        expect(res.rows.length).toBe(ROWS);
        await tmp.close();
        const attached = await my.attach(aJoinable(name, my));
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
        const attached = await db.attach(aJoinable(name, db));
        expect(attached).toBeDefined();
      }),
    );
    await sleep(100);
    expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
    const res = await db.allDocs();
    expect(res.rows.length).toBe(ROWS + ROWS * joinableDBs.length);
  });

  it("it empty inbound syncing", async () => {
    const name = `empty-db-${sthis.nextId().str}`;
    const mydb = fireproof(name, {
      storeUrls: attachableStoreUrls(name, db),
    });
    await Promise.all(
      joinableDBs.map(async (name) => {
        const attached = await mydb.attach(aJoinable(name, mydb));
        expect(attached).toBeDefined();
      }),
    );
    await sleep(100);
    expect(mydb.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
    const res = await mydb.allDocs();
    expect(res.rows.length).toBe(ROWS * joinableDBs.length);
  });

  it("prepare only once", async () => {
    const db = fireproof(`db-${sthis.nextId().str}`, {
      storeUrls: {
        base: `memory://prepare`,
      },
    });
    const mocked = aJoinable("test", db);
    const originalPrepare = mocked.prepare;
    mocked.prepare = vi.fn(() => originalPrepare.apply(mocked));
    expect(mocked.prepare).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) {
      await db.attach(mocked);
      expect(mocked.prepare).toHaveBeenCalled();
    }
  });

  it("offline sync", async () => {
    const id = sthis.nextId().str;
    // console.log("sync-offline");

    // console.log("outbound-db");
    // console.log("-1");
    const poutbound = await prepareDb(`outbound-db-${id}`, "memory://sync-outbound");
    // console.log("-2");
    await poutbound.db.attach(aJoinable(`sync-${id}`, poutbound.db));
    await poutbound.db.close();
    // console.log("-3");
    const outRows = await readDb(`outbound-db-${id}`, "memory://sync-outbound");

    expect(outRows.length).toBe(ROWS);

    const pinbound = await prepareDb(`inbound-db-${id}`, `memory://sync-inbound`);
    await pinbound.db.close();
    const inRows = await readDb(`inbound-db-${id}`, "memory://sync-inbound");

    expect(inRows.length).toBe(ROWS);

    const inbound = await syncDb(`inbound-db-${id}`, `memory://sync-inbound`);
    await inbound.attach(aJoinable(`sync-${id}`, inbound));
    await inbound.close();

    // console.log("result");
    const resultRows = await readDb(`inbound-db-${id}`, "memory://sync-inbound");
    // console.log(re);
    // console.log(inRows);
    expect(resultRows.length).toBe(ROWS * 2);
    expect(resultRows).toEqual(outRows.concat(inRows).sort((a, b) => a.key.localeCompare(b.key)));

    const joined = { db: await syncDb(`joined-db-${id}`, "memory://sync-joined") };
    await joined.db.attach(aJoinable(`sync-${id}`, joined.db));
    await joined.db.close();
    const joinedRows = await readDb(`joined-db-${id}`, "memory://sync-joined");
    expect(resultRows).toEqual(joinedRows);
  }, 100_000);
});

// interface WaitItem {
//   ev: IdleEventFromBlockstore | BusyEventFromBlockstore;
//   waitforIdle: Set<Future<IdleEventFromBlockstore>>;
// }
// class WaitIdle {
//   readonly _waitState = new Map<string, WaitItem>();
//
//   upsertItem(name: string) {
//     let item = this._waitState.get(name);
//     if (!item) {
//       item = { ev: {} as IdleEventFromBlockstore, waitforIdle: new Set() };
//       this._waitState.set(name, item);
//     }
//     return item;
//   }
//   upsertEvent(name: string, ev: IdleEventFromBlockstore | BusyEventFromBlockstore) {
//     this.upsertItem(name).ev = ev;
//   }
//
//   readonly _traceFn = (ev: TraceEvent) => {
//     console.log("trace", ev.event);
//     if (EventIsIdleFromBlockstore(ev) && ev.ledger) {
//       const item = this.upsertItem(ev.ledger.name);
//       item.ev = ev;
//       console.log("database is now idle", ev.ledger.name);
//       Array.from(item.waitforIdle).forEach((waiter) => {
//         waiter.resolve(ev);
//         item.waitforIdle.delete(waiter);
//       });
//     }
//     if (EventIsBusyFromBlockstore(ev) && ev.ledger) {
//       this.upsertEvent(ev.ledger.name, ev);
//     }
//   };
//
//   traceFn(): TraceFn {
//     return this._traceFn;
//   }
//
//   async wait(dbs: Database[]) {
//     const waiting = dbs.map((db) => {
//       const item = this.upsertItem(db.name);
//       let waiter: Promise<IdleEventFromBlockstore>;
//       if (EventIsIdleFromBlockstore(item.ev)) {
//         console.log("database is already idle", db.name);
//         waiter = Promise.resolve(item.ev);
//       } else {
//         const future = new Future<IdleEventFromBlockstore>();
//         item.waitforIdle.add(future);
//         waiter = future.asPromise();
//       }
//       return waiter;
//     });
//     console.log(dbs.map((db) => db.name));
//     await Promise.all(waiting);
//   }
// }

describe("sync", () => {
  const sthis = ensureSuperThis();
  it("online sync", async () => {
    const id = sthis.nextId().str;
    // const waitIdle = new WaitIdle();
    const dbs = await Promise.all(
      Array(3)
        .fill(0)
        .map(async (_, i) => {
          const tdb = await prepareDb(`online-db-${id}-${i}`, `memory://local-${id}-${i}`);
          await tdb.db.attach(aJoinable(`sync-${id}`, tdb.db));
          return tdb;
        }),
    );

    // await waitIdle.wait(dbs);
    await sleep(500);
    await Promise.all(
      dbs.map(async (tdb) => {
        const rows = await tdb.db.allDocs();
        // console.log(db.name, rows.rows.length);
        // console.log(rows.rows.length);
        expect(rows.rows.length).toBe(ROWS * dbs.length);
      }),
    );

    const keys = (
      await Promise.all(
        dbs.map(async (db) => {
          await sleep(100 * Math.random());
          return writeRow(db, "add-online");
        }),
      )
    ).flat();
    await sleep(500);
    await Promise.all(
      dbs.map(async (db) => {
        for (const key of keys) {
          const rows = await db.db.get(key);
          expect(rows).toEqual({ _id: key, value: key });
        }
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const toCloseDbs = [dbs.shift()!, dbs.pop()!];
    await Promise.all(toCloseDbs.map((tdb) => tdb.db.close()));

    await Promise.all(
      dbs.map(async (db) => {
        return writeRow(db, "mid-dbs");
      }),
    );

    const reOpenedWithoutAttach = await Promise.all(
      toCloseDbs.map(async (tdb) => {
        // console.log("reopen", tdb.db.name, tdb.db.ledger.ctx.get("base"));
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const db = await syncDb(tdb.db.name, tdb.db.ledger.ctx.get("base")!);
        return { db, dbId: tdb.dbId };
      }),
    );

    // const reOpenKeys = (
    await Promise.all(
      dbs.map(async (db) => {
        return writeRow(db, "reOpenKeys");
      }),
    );
    // ).flat();

    await Promise.all(
      reOpenedWithoutAttach.map(async (tdb) => {
        await tdb.db.attach(aJoinable(`sync-${id}`, tdb.db));
      }),
    );
    await sleep(500);

    await Promise.all(
      dbs.map(async (tdb) => {
        const rows = await tdb.db.allDocs();
        // console.log(db.name, rows.rows.length);
        // console.log(rows.rows.length);
        expect(rows.rows.length).toBe(8 * ROWS * dbs.length);
      }),
    );

    await Promise.all(dbs.map((tdb) => tdb.db.close()));
    await Promise.all(reOpenedWithoutAttach.map((tdb) => tdb.db.close()));
  }, 100_000);

  it.skip"sync outbound", async () => {
    const id = sthis.nextId().str;

    const outbound = await prepareDb(`outbound-db-${id}`, `memory://sync-outbound-${id}`);
    await outbound.db.attach(aJoinable(`sync-${id}`, outbound.db));
    await writeRow(outbound, "outbound");

    const inbound = await prepareDb(`inbound-db-${id}`, `memory://sync-inbound-${id}`);
    await inbound.db.attach(aJoinable(`sync-${id}`, inbound.db));
    await writeRow(inbound, "both-inbound");
    await writeRow(outbound, "both-outbound");
    await sleep(1000);
    await inbound.db.close();
    await outbound.db.close();

    const inRows = await readDb(`inbound-db-${id}`, `memory://sync-inbound-${id}`);
    const outRows = await readDb(`outbound-db-${id}`, `memory://sync-outbound-${id}`);
    console.log(
      "out",
      outRows.map((row) => row.key),
    );
    console.log(
      "in",
      inRows.map((row) => row.key),
    );
    expect(inRows).toEqual(outRows);
  }, 100_000);
});

async function syncDb(name: string, base: string, tracer?: TraceFn) {
  const db = fireproof(name, {
    storeUrls: {
      base: BuildURI.from(base).setParam(PARAM.STORE_KEY, "@fireproof:attach@"), // .setParam(PARAM.SELF_REFLECT, "yes"),
    },
    ctx: AppContext.merge({ base }),
    tracer,
  });
  await db.ready();
  return db;
}

async function prepareDb(name: string, base: string, tracer?: TraceFn) {
  {
    const db = await syncDb(name, base, tracer);
    await db.ready();
    const dbId = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car.id();
    const ret = { db, dbId };
    await writeRow(ret, `initial`);
    await db.close();
  }

  const db = await syncDb(name, base);
  await db.ready();
  const dbId = await db.ledger.crdt.blockstore.loader.attachedStores.local().active.car.id();
  // const ret = { db, dbId };
  return { db, dbId };
}

async function readDb(name: string, base: string) {
  const db = await syncDb(name, base);
  const rows = await db.allDocs();
  await db.close();
  return rows.rows.sort((a, b) => a.key.localeCompare(b.key));
}

async function writeRow(pdb: WithoutPromise<ReturnType<typeof prepareDb>>, style: string) {
  return await Promise.all(
    Array(ROWS)
      .fill(0)
      .map(async (_, i) => {
        const key = `${pdb.dbId}-${pdb.db.name}-${style}-${i}`;
        // console.log(key);
        await pdb.db.put({ _id: key, value: key });
        return key;
      }),
  );
}
