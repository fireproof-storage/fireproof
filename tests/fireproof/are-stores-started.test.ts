import { fireproof, bs } from "@fireproof/core";
import { vi } from "vitest";

class MockaStartableStore {
  start = vi.fn();
  save = vi.fn();
  load = vi.fn();
  enqueue = vi.fn();
}
describe("areStoresStarted", () => {
  it("started data - meta - wal", async () => {
    const dataStore = new MockaStartableStore();
    const metaStore = new MockaStartableStore();
    const walStore = new MockaStartableStore();
    const db = fireproof("datastore-started", {
      store: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        makeDataStore: async (loader: bs.Loadable): Promise<bs.DataStore> => {
          return dataStore as unknown as bs.DataStore;
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        makeMetaStore: async (loader: bs.Loadable): Promise<bs.MetaStore> => {
          return metaStore as unknown as bs.MetaStore;
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        makeRemoteWAL: async (loader: bs.Loadable): Promise<bs.RemoteWAL> => {
          return walStore as unknown as bs.RemoteWAL;
        },
      },
    });
    await db.put({ key: "foo", value: "bar" });

    expect(dataStore.start).toHaveBeenCalled();
    expect(metaStore.start).toHaveBeenCalled();
    expect(walStore.start).toHaveBeenCalled();
  });
});
