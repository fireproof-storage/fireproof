import { fireproof } from "@fireproof/core-base";
import { BuildURI, URI } from "@adviser/cement";
import { describe, beforeAll, it, expect } from "vitest";
import { testSuperThis } from "@fireproof/cloud-base";
import { MockJWK, mockJWK } from "./test-helper.js";
import { CloudGateway, SimpleTokenStrategy, toCloud } from "@fireproof/core-gateways-cloud";
import { SerdeGatewayCtx } from "@fireproof/core-types/blockstore";

describe("fp-cloud", () => {
  const sthis = testSuperThis();
  let fpgw: CloudGateway;
  let auth: MockJWK;

  let fpGwUrl: URI;

  beforeAll(async () => {
    fpgw = new CloudGateway(sthis);
    auth = await mockJWK(sthis);

    fpGwUrl = BuildURI.from(sthis.env.get("FP_ENDPOINT"))
      .protocol("fpcloud")
      .setParam("tenant", auth.claims.tenants[0].id)
      .setParam("ledger", auth.claims.ledgers[0].id)
      .setParam("protocol", "ws")
      .URI();
  });

  // describe.each([
  //   // force multiple lines
  //   NodeHonoServerFactory(sthis),
  // ])("$name - Connection", (honoServer) => {
  // const port = honoServer.port;
  // const port = +(process.env.FP_WRANGLER_PORT || 0) || 1024 + Math.floor(Math.random() * (65536 - 1024));

  it("not ready getCloudConnectionItem", async () => {
    const ret = await fpgw.start({} as SerdeGatewayCtx, fpGwUrl.build().hostname("kaputt").URI());
    expect(ret.isErr()).toBeFalsy();
    const item = await fpgw.getCloudConnectionItem(sthis.logger, fpGwUrl);
    expect(item).toBeDefined();
    expect(item.conn.isErr()).toBeTruthy();
  });

  it("ready getCloudConnectionItem", async () => {
    const url = fpGwUrl.build().setParam("authJWK", auth.authType.params.jwk).URI();
    const ret = await fpgw.start({} as SerdeGatewayCtx, url);
    expect(ret.isErr()).toBeFalsy();
    const item = await fpgw.getCloudConnectionItem(sthis.logger, BuildURI.from(url).setParam("store", "test").URI());
    expect(item).toBeDefined();
    expect(item.conn.isOk()).toBeTruthy();
  });

  it("only connect once", async () => {
    const db = fireproof(`hello:world`, {
      storeUrls: {
        base: "memory://connect/once",
      },
    });

    // console.log(">>>>>", auth.authType.params.jwk);
    // const tenant = `tenant-${sthis.nextId().str}`;
    const attachs = await Promise.all(
      Array(10)
        .fill(0)
        .map(() => {
          const x = db.attach(
            toCloud({
              urls: { base: fpGwUrl },
              strategy: new SimpleTokenStrategy(auth.authType.params.jwk),
            }),
          );
          return x;
        }),
    );
    expect(attachs.length).toEqual(10);
    for (const attach of attachs) {
      expect(attachs[0].keyed).toEqual(attach.keyed);
    }

    expect(db.ledger.crdt.blockstore.loader.attachedStores.remotes().length).toEqual(1);

    const res = await db.put({ hello: "world" });
    const ret = await db.get<{ hello: string }>(res.id);
    expect(ret.hello).toEqual("world");
  });
});
