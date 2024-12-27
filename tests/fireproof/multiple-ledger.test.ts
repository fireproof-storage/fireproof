import { Database, ensureSuperThis, fireproof } from "@fireproof/core";

interface DBItem {
  readonly db: Database;
  readonly name: string;
}

function shuffle(ina: DBItem[]): DBItem[] {
  const array = [...ina];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

describe("Multiple Databases", () => {
  const dbs: DBItem[] = [];
  const sthis = ensureSuperThis();
  const rows = 10;
  const concurrentDbs = 7;
  beforeEach(async () => {
    const group = sthis.nextId().str;
    await Promise.all(
      Array(concurrentDbs)
        .fill(0)
        .map(async (_, i) => {
          const name = `db-${group}-${i}`;
          const db = fireproof(name);
          dbs.push({ db, name });
          for (let i = 0; i < rows; i++) {
            await db.put({ _id: `${name}-${i}`, hello: "world" });
          }
        }),
    );
  });
  afterEach(async () => {
    await Promise.all(
      dbs.map(async (db) => {
        await db.db.close();
        await db.db.destroy();
      }),
    );
    dbs.length = 0;
  });

  it("random access to multiple databases", async () => {
    const random = shuffle(dbs);
    const res = await Promise.all(
      random.map((di) => {
        return Promise.all(
          Array(10)
            .fill(0)
            .map(async (_, i) => di.db.get(`${di.name}-${i}`)),
        );
      }),
    );
    // console.log(res)
    res.forEach((res, i) => {
      for (let j = 0; j < rows; j++) {
        expect(res[j]._id).toBe(`${random[i].name}-${j}`);
      }
    });
  });
});
