import { WALProcessor, walProcessor, WALProcessorImpl, withLoader } from "../../src/blockstore/wal-processor";
import { AnyLink, DataStore, DbMeta, FileOp, Loadable, WALStore } from "../../src/blockstore";
import { mockSuperThis } from "../helpers";

async function createState(ref: WALProcessor, loader: Loadable, walStore: WALStore, jobs = 10) {
  for (let i = 0; i < jobs; i++) {
    ref.addState({
      fileOperations: withLoader(loader, walStore, [
        { cid: `${i}:fileOp1` as unknown as AnyLink, public: true },
        { cid: `${i}:fileOp2` as unknown as AnyLink, public: false },
      ] as FileOp[]),
      noLoaderOps: withLoader(loader, walStore, [
        {
          cars: Array(4)
            .fill(0)
            .map((_, j) => `${i}:noLoaderOp1.${j}` as unknown as AnyLink),
        },
        { cars: [`${i}:noLoaderOp2` as unknown as AnyLink] },
      ] as DbMeta[]),
      operations: withLoader(loader, walStore, [
        {
          cars: Array(4)
            .fill(0)
            .map((_, j) => `${i}:op1.${j}` as unknown as AnyLink),
        },
        { cars: [`${i}:op2` as unknown as AnyLink] },
      ] as DbMeta[]),
    });
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}

describe("blockstore/wal-processor", () => {
  const sthis = mockSuperThis();
  it("check once", async () => {
    const ref = walProcessor(sthis);
    for (let i = 0; i < 10; i++) {
      expect(ref).toEqual(walProcessor(sthis));
    }
  });
  it("empty snapState", async () => {
    const ref = walProcessor(sthis);
    const loader = {} as Loadable;
    expect(ref.snapState(loader)).toEqual({
      fileOperations: [],
      noLoaderOps: [],
      operations: [],
    });
  });
  it("loader without remoteCarStore", async () => {
    const ref = new WALProcessorImpl(sthis);
    (ref as unknown as { trigger: () => void }).trigger = () => {
      /* noop */
    };
    const loader = { id: "l1", sthis } as Loadable;
    const walStore = { id: "wal1" } as WALStore;
    await createState(ref, loader, walStore);
    expect(ref.snapState(loader)).toEqual({
      fileOperations: [],
      noLoaderOps: [],
      operations: [],
    });
  });
  it("loader with remoteCarStore", async () => {
    const ref = new WALProcessorImpl(sthis);
    (ref as unknown as { trigger: () => void }).trigger = () => {
      /* noop */
    };
    const loader = { id: "l1", remoteCarStore: {} , sthis} as Loadable;
    const walStore = { id: "wal1" } as WALStore;
    await createState(ref, loader, walStore);
    expect(ref.snapState(loader)).toEqual({
      fileOperations: Array(10)
        .fill(0)
        .flatMap((_, i) => [
          { cid: `${i}:fileOp1` as unknown as AnyLink, public: true },
          { cid: `${i}:fileOp2` as unknown as AnyLink, public: false },
        ]),
      noLoaderOps: Array(10)
        .fill(0)
        .flatMap((_, i) => [
          {
            cars: Array(4)
              .fill(0)
              .map((_, j) => `${i}:noLoaderOp1.${j}` as unknown as AnyLink),
          },
          { cars: [`${i}:noLoaderOp2` as unknown as AnyLink] },
        ]),
      operations: Array(10)
        .fill(0)
        .flatMap((_, i) => [
          {
            cars: Array(4)
              .fill(0)
              .map((_, j) => `${i}:op1.${j}` as unknown as AnyLink),
          },
          { cars: [`${i}:op2` as unknown as AnyLink] },
        ]),
    });
  });

  it("loader process remoteCarStore", async () => {
    const ref = new WALProcessorImpl(sthis);
    // (ref as unknown as { trigger: () => void }).trigger = () => { /* noop */ };
    const mockFns = {
      remoteCarStore_save: vitest.fn(),
      remoteFileStore_save: vitest.fn(),
      carStore_load: vitest.fn(),
      fileStore_load: vitest.fn(),
      walStore_save: vitest.fn(), // .mockResolvedValue({}),
    };
    const loader = {
      id: "l1",
      sthis,
      remoteCarStore: {
        save: async (...args: object[]) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return mockFns.remoteCarStore_save(...args);
        },
      } as unknown as DataStore,
      remoteFileStore: {
        save: async (...args: object[]) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          mockFns.remoteFileStore_save(...args);
        },
      } as unknown as DataStore,
      carStore: async () => {
        return {
          load: async (...args: object[]) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            mockFns.carStore_load(...args);
            return {
              cid: args[0],
              bytes: args,
            };
          },
        } as unknown as DataStore;
      },
      fileStore: async () => {
        return {
          load: async (...args: object[]) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            mockFns.fileStore_load(...args);
            return {
              cid: args[0],
              bytes: args,
            };
          },
        } as unknown as DataStore;
      },
    } as Loadable;
    const walStore = {
      id: "wal1",
      save: async (...args: object[]) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        mockFns.walStore_save(...args);
      },
    } as unknown as WALStore;
    let createComplete = false;
    createState(ref, loader, walStore).finally(() => {
      /* background fill */
      createComplete = true;
    });
    console.log(sthis.logger)
    while (!createComplete) {
      console.log("-1", sthis.env.get("FP_DEBUG"));
      await ref.sync();
      console.log("-2");
      expect(ref.snapState(loader)).toEqual({
        fileOperations: [],
        noLoaderOps: [],
        operations: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    console.log("-3");
    await ref.sync();
    console.log("-4");
    expect(ref.snapState(loader)).toEqual({
      fileOperations: [],
      noLoaderOps: [],
      operations: [],
    });
    /* fileStore section */
    expect(mockFns.fileStore_load).toHaveBeenCalledTimes(20);
    expect(mockFns.fileStore_load.mock.calls).toEqual(
      Array(10)
        .fill(0)
        .flatMap((_, i) => [[`${i}:fileOp1`], [`${i}:fileOp2`]]),
    );
    expect(mockFns.remoteFileStore_save.mock.calls).toEqual(
      Array(10)
        .fill(0)
        .flatMap((_, i) => [
          [{ bytes: [`${i}:fileOp1`], cid: `${i}:fileOp1` }, { public: true }],
          [{ bytes: [`${i}:fileOp2`], cid: `${i}:fileOp2` }, { public: false }],
        ]),
    );
    /* op section */
    expect(mockFns.carStore_load).toHaveBeenCalledTimes(100);
    expect(mockFns.carStore_load.mock.calls.filter((i) => i[0].includes("noLoaderOp"))).toEqual(
      Array(10)
        .fill(0)
        .flatMap((_, i) => [
          [`${i}:noLoaderOp1.0`],
          [`${i}:noLoaderOp1.1`],
          [`${i}:noLoaderOp1.2`],
          [`${i}:noLoaderOp1.3`],
          [`${i}:noLoaderOp2`],
        ]),
    );
    expect(mockFns.carStore_load.mock.calls.filter((i) => !i[0].includes("noLoaderOp"))).toEqual(
      Array(10)
        .fill(0)
        .flatMap((_, i) => [[`${i}:op1.0`], [`${i}:op1.1`], [`${i}:op1.2`], [`${i}:op1.3`], [`${i}:op2`]]),
    );
    expect(mockFns.remoteCarStore_save.mock.calls.filter((i) => i[0].cid.includes("noLoaderOp"))).toEqual(
      Array(10)
        .fill(0)
        .flatMap((_, i) => [
          [{ bytes: [`${i}:noLoaderOp1.0`], cid: `${i}:noLoaderOp1.0` }],
          [{ bytes: [`${i}:noLoaderOp1.1`], cid: `${i}:noLoaderOp1.1` }],
          [{ bytes: [`${i}:noLoaderOp1.2`], cid: `${i}:noLoaderOp1.2` }],
          [{ bytes: [`${i}:noLoaderOp1.3`], cid: `${i}:noLoaderOp1.3` }],
          [{ bytes: [`${i}:noLoaderOp2`], cid: `${i}:noLoaderOp2` }],
        ]),
    );
    expect(mockFns.remoteCarStore_save.mock.calls.filter((i) => !i[0].cid.includes("noLoaderOp"))).toEqual(
      Array(10)
        .fill(0)
        .flatMap((_, i) => [
          [{ bytes: [`${i}:op1.0`], cid: `${i}:op1.0` }],
          [{ bytes: [`${i}:op1.1`], cid: `${i}:op1.1` }],
          [{ bytes: [`${i}:op1.2`], cid: `${i}:op1.2` }],
          [{ bytes: [`${i}:op1.3`], cid: `${i}:op1.3` }],
          [{ bytes: [`${i}:op2`], cid: `${i}:op2` }],
        ]),
    );
    expect(mockFns.walStore_save.mock.calls).toEqual([]);
  });
});
