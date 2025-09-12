import { BuildURI, URI } from "@adviser/cement";
import { fireproof } from "@fireproof/core-base";
import { registerStoreProtocol } from "@fireproof/core-blockstore";
import { MemoryGateway } from "@fireproof/core-gateways-memory";
import {
  DbMetaEvent,
  FPEnvelopeFile,
  Loadable,
  SerdeGateway,
  SerdeGatewayCtx,
  V2SerializedMetaKey,
} from "@fireproof/core-types-blockstore";
import { AddKeyToDbMetaGateway } from "@fireproof/core-gateways-base";
import { beforeAll, describe, expect, it, vitest } from "vitest";
import { KeyBag } from "@fireproof/core-keybag";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { Database, PARAM } from "@fireproof/core-types-base";

describe("MetaKeyHack", () => {
  const storageMap = new Map();

  const sthis = ensureSuperThis();
  let ctx: SerdeGatewayCtx;
  const memGw = new MemoryGateway(sthis, storageMap);
  registerStoreProtocol({
    protocol: "hack:",
    defaultURI: () => URI.from(`hack://localhost?version=hack`),
    serdegateway: async () => {
      return new AddKeyToDbMetaGateway(memGw, "v2");
    },
  });

  let db: Database;
  beforeAll(async () => {
    db = fireproof("test", {
      storeUrls: {
        base: BuildURI.from("hack://localhost").setParam(PARAM.SELF_REFLECT, "x"),
      },
      keyBag: {
        url: "memory://./dist/kb-dir-partykit?extractKey=_deprecated_internal_api",
      },
    });
    await db.ready();
    ctx = { loader: db.ledger.crdt.blockstore.loader };
  });

  it("inject key into meta", async () => {
    const loader = db.ledger.crdt.blockstore.loader;
    const metaStore = loader.attachedStores.local().active.meta;
    const subscribeFn = vitest.fn();
    const unreg = await metaStore.realGateway.subscribe(
      ctx,
      metaStore.url(),
      // metaStore.url().build().setParam(PARAM.SELF_REFLECT, "x").URI(),
      subscribeFn,
    );
    expect(unreg.isOk()).toBeTruthy();
    await db.put({ val: "test" });

    const dataStore = loader.attachedStores.local().active.car;
    const kb = await KeyBag.create(db.ledger.opts.keyBag);
    const rDataStoreKeyItem = await kb.getNamedKey(dataStore.url().getParam(PARAM.STORE_KEY) ?? "");

    await rDataStoreKeyItem.Ok().upsert("zBUFMmu5c3VdCa4r2DZTzhR", { def: false });
    await rDataStoreKeyItem.Ok().upsert("zH1fyizirAiYVxoaQ2XZ3Xj", { def: false });

    expect(rDataStoreKeyItem.isOk()).toBeTruthy();
    const rUrl = await memGw.buildUrl(ctx, metaStore.url(), "main");
    // console.log(">>>>", rUrl.Ok().toString())
    const rGet = await memGw.get<Uint8Array>(ctx, rUrl.Ok());
    const metas = JSON.parse(ctx.loader.sthis.txt.decode(rGet.Ok().payload)) as V2SerializedMetaKey;
    const keyMaterials = metas.keys;
    const dataStoreKeyMaterial = await rDataStoreKeyItem.Ok().asV2StorageKeyItem();
    expect(keyMaterials.length).toBeGreaterThan(0);
    expect(dataStoreKeyMaterial).toEqual({
      keys: {
        ...(await rDataStoreKeyItem
          .Ok()
          .get()
          .then(async (r) => ({
            [r?.fingerPrint as string]: {
              default: true,
              fingerPrint: r?.fingerPrint,
              key: await r?.extract().then((i) => i.keyStr),
            },
          }))),
        z3boMcLEQxjZAMrVo2j3k9bZJzmSqXkQmh6q7bLZ2nRuo: {
          default: false,
          fingerPrint: "z3boMcLEQxjZAMrVo2j3k9bZJzmSqXkQmh6q7bLZ2nRuo",
          key: "zH1fyizirAiYVxoaQ2XZ3Xj",
        },
        zG5F2VWVAs3uAFyLE5rty5WWo7zJ1oBmYTdnraxfhaHG5: {
          default: false,
          fingerPrint: "zG5F2VWVAs3uAFyLE5rty5WWo7zJ1oBmYTdnraxfhaHG5",
          key: "zBUFMmu5c3VdCa4r2DZTzhR",
        },
      },
      name: "@test-data@",
    });

    // expect(keyMaterials.every((k) => k === dataStoreKeyMaterial.keyStr)).toBeTruthy()
    // expect(subscribeFn.mock.calls).toEqual([]);
    expect(subscribeFn).toHaveBeenCalledTimes(2);
    const addKeyToDbMetaGateway = metaStore.realGateway as AddKeyToDbMetaGateway;
    expect(
      subscribeFn.mock.calls.map((i) => i.map((i) => i.payload.map((i: DbMetaEvent) => i.eventCid.toString()))).flat(2),
    ).toEqual(Array.from(new Set(addKeyToDbMetaGateway.lastDecodedMetas.map((i) => i.metas.map((i) => i.cid)).flat(2))));
    unreg.Ok()();
  });
});
