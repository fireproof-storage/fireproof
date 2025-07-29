import { fireproof } from "@fireproof/core";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { describe, expect, it } from "vitest";
import { Future } from "@adviser/cement";

describe("concurrent opens", () => {
  const sthis = ensureSuperThis();
  const dbBaseName = `test-concurrent-${sthis.nextId().str}`;

  it("open and get allDocs", async () => {
    const future = new Future();
    const dones = [];
    const loops = 100;
    for (let i = 0; i < loops; i++) {
      // eslint-disable-next-line no-async-promise-executor
      setTimeout(async () => {
        // for (let t = 0; t < 10; t++) {
        //   const db = fireproof(`${dbBaseName}-${i}`);
        //   await db.put({ _id: `test-${t}`, foo: "bar" });
        //   await db.close();
        // }
        const db = fireproof(`${dbBaseName}-${i}`);
        await Promise.all(
          new Array(3).fill(0).map(async (_, j) => {
            await db.put({ _id: `test-${j}`, foo: "bar" });
          }),
        );
        const allDocs = await db.allDocs();
        expect(allDocs.rows.length).toBe(3);
        await db.close();
        dones.push(i);
        if (dones.length >= loops) {
          future.resolve(undefined);
        }
      }, 0);
      //await db.destroy();
    }

    await future.asPromise();
    // await Promise.all(new Array(1000).fill(0).map(async (_, i) => {
    //     const db = fireproof(`${dbBaseName}-${i}`);
    //     await Promise.all(new Array(3).fill(0).map(async (_, j) => {
    //         await db.put({ _id: `test-${j}`, foo: "bar" });
    //     }));
    //     const allDocs = await db.allDocs();
    //     expect(allDocs.rows.length).toBe(3);
    //     await db.close();
    //     // await db.destroy();
    // }));
  });
});
