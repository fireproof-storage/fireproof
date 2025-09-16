import { defaultGatewayFactoryItem } from "@fireproof/core-blockstore";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { it, describe, } from "vitest";

describe("sync-api", () => {
  const sthis = ensureSuperThis();
  it("factory to open database", async () => {
    const gw = defaultGatewayFactoryItem();
    const syncDB = await gw.fpsync(sthis, gw.defaultURI(sthis));

    await syncDB.close();
  });
}, { timeout: 10000000 });
