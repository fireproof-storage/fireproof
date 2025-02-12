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
        car: { url: "memory://${this.name}" },
        meta: { url: "memory://${this.name}" },
        file: { url: "memory://${this.name}" },
      });
    }
  }
  function aJoinable(name: string): Attachable {
    return new AJoinable(name);
  }

  let db: Database;
  beforeAll(async () => {
    const set = Math.random().toString(16);
    await Promise.all(
      Array.from({ length: 10 }).map(async (_, i) => {
        const db = fireproof(`remote-db-${i}-${set}`, {
          storeUrls: {
            base: `memory://remote-db-${i}-${set}`,
          },
        });
        for (let j = 0; j < 10; j++) {
          await db.put({ _id: `${i}-${j}`, value: `${i}-${set}` });
        }
        await db.close();
        return db;
      }),
    );

    db = fireproof(`db-${set}`, {
      storeUrls: {
        base: `memory://db-${set}`,
      },
    });
  });
  afterAll(async () => {
    await db.close();
  });

  it("it is joinable", async () => {
    for (let i = 0; i < 10; i++) {
      // create  meta/car/files store from aJoinable
      // retrieve meta from attachable and subscribe to it
      // merge incoming meta with local
      // the attach meta includes source url's which ref back to aJoinable Attachable

      const attached = await db.attach(aJoinable("i" + i));
      expect(attached).toBeDefined();
      await attached.detach();
    }
  });
});
