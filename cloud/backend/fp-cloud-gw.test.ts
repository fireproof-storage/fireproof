import { ensureSuperThis, fireproof } from "@fireproof/core";
import { FireproofCloudGateway } from "../../src/runtime/gateways/cloud/gateway.js";
import { BuildURI, URI } from "@adviser/cement";
import { SerdeGatewayCtx } from "../../src/blockstore/serde-gateway.js";
import { MockJWK, mockJWK } from "./node/test-helper.js";
import { toCloud } from "use-fireproof";
import { SimpleTokenStrategy } from "../../src/runtime/gateways/cloud/to-cloud.js";

describe("fp-cloud", () => {
  const sthis = ensureSuperThis();
  let fpgw: FireproofCloudGateway;
  let auth: MockJWK;

  beforeAll(async () => {
    fpgw = new FireproofCloudGateway(sthis);
    auth = await mockJWK(sthis);
  });

  // describe.each([
  //   // force multiple lines
  //   NodeHonoServerFactory(sthis),
  // ])("$name - Connection", (honoServer) => {
  // const port = honoServer.port;
  // const port = +(process.env.FP_WRANGLER_PORT || 0) || 1024 + Math.floor(Math.random() * (65536 - 1024));

  it("not ready getCloudConnectionItem", async () => {
    const ret = await fpgw.start({} as SerdeGatewayCtx, BuildURI.from(sthis.env.get("FP_STORAGE_URL")).hostname("kaputt").URI());
    expect(ret.isErr()).toBeFalsy();
    const item = await fpgw.getCloudConnectionItem(sthis.logger, URI.from(sthis.env.get("FP_STORAGE_URL")));
    expect(item).toBeDefined();
    expect(item.conn.isErr()).toBeTruthy();
  });

  it("ready getCloudConnectionItem", async () => {
    const url = BuildURI.from(sthis.env.get("FP_STORAGE_URL")).setParam("authJWK", auth.authType.params.jwk).URI();
    const ret = await fpgw.start({} as SerdeGatewayCtx, url);
    expect(ret.isErr()).toBeFalsy();
    const item = await fpgw.getCloudConnectionItem(sthis.logger, BuildURI.from(url).setParam("store", "test").URI());
    expect(item).toBeDefined();
    expect(item.conn.isOk()).toBeTruthy();
  });

  it("only connect once", async () => {
    const db = fireproof(`hello: `);

    const tenant = `tenant-${sthis.nextId().str}`;
    const attachs = await Promise.all(
      Array(10)
        .fill(0)
        .map(() => {
          const x = db.attach(
            toCloud({
              urls: { base: BuildURI.from(sthis.env.get("FP_STORAGE_URL")).setParam("tenant", tenant) },
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
