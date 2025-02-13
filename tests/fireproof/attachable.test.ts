import { Attachable, Database, fireproof, GatewayUrlsParam } from "@fireproof/core";

describe("join function", () => {
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
    const set = Math.random().toString(16);
    joinableDBs = await Promise.all(
      (new Array(1)).fill(1).map(async (_, i) => {
        const name = `remote-db-${i}-${set}`;
        const db = fireproof(name, {
          storeUrls: {
            base: `memory://${name}`,
          },
        });
        for (let j = 0; j < 10; j++) {
          await db.put({ _id: `${i}-${j}`, value: `${i}-${set}` });
        }
        await db.close();
        return name;
      }),
    );

    db = fireproof(`db-${set}`, {
      storeUrls: {
        base: `memory://db-${set}`,
      },
    });
    for (let j = 0; j < 10; j++) {
      await db.put({ _id: `db-${j}`, value: `db-${set}` });
    }

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
    await Promise.all(
      joinableDBs.map(async (name) =>{
        const tmp = fireproof(name, {
          storeUrls: {
            base: `memory://${name}`,
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
    }))
    expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toBe(joinableDBs.length);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const res = await db.allDocs();
    expect(res.rows.length).toBe(100);
  });
});
