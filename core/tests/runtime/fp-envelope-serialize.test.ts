import { createDbMetaEvent } from "@fireproof/core-blockstore";
import { mockSuperThis, simpleCID } from "../helpers.js";
import { BuildURI, Result } from "@adviser/cement";
import { fpDeserialize, fpSerialize } from "@fireproof/core-gateways-base";
import {
  DbMetaEvent,
  FPEnvelopeCar,
  FPEnvelopeFile,
  FPEnvelopeMeta,
  FPEnvelopeTypes,
  FPEnvelopeWAL,
  SerializedMeta,
  WALState,
} from "@fireproof/core-types-blockstore";
import { toJSON } from "multiformats/link";
import { describe, expect, it } from "vitest";

describe("storage-content", () => {
  const sthis = mockSuperThis();
  it("car", async () => {
    const raw = new Uint8Array([55, 56, 57]);
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=car&suffix=.car").URI(), Result.Ok(raw));
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual(FPEnvelopeTypes.CAR);
    expect(res.unwrap().payload).toEqual(raw);
  });

  it("file", async () => {
    const raw = new Uint8Array([55, 56, 57]);
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=file").URI(), Result.Ok(raw));
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual(FPEnvelopeTypes.FILE);
    expect(res.unwrap().payload).toEqual(raw);
  });

  it("meta", async () => {
    const ref = [
      {
        cid: "bafyreiaqmtw5jfudn6r6dq7mcmytc2z5z3ggohcj3gco3omjsp3hr73fpy",
        data: "MomRkYXRhoWZkYk1ldGFYU3siY2FycyI6W3siLyI6ImJhZzR5dnFhYmNpcWNod29zeXQ3dTJqMmxtcHpyM2w3aWRlaTU1YzNmNnJ2Z3U3cXRmYXRoMnl2NnZuaWtjeXEifV19Z3BhcmVudHOA",
        parents: [(await simpleCID(sthis)).toString(), (await simpleCID(sthis)).toString()],
      },
    ];
    const raw = sthis.txt.encode(JSON.stringify(ref));
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=meta").URI(), Result.Ok(raw));
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual(FPEnvelopeTypes.META);
    const dbMetas = res.unwrap().payload as DbMetaEvent[];
    expect(dbMetas.length).toBe(1);
    const dbMeta = dbMetas[0];
    expect(dbMeta.parents.map((i) => i.toString())).toStrictEqual(ref[0].parents);
    expect(dbMeta.eventCid.toString()).toEqual("bafyreiaqmtw5jfudn6r6dq7mcmytc2z5z3ggohcj3gco3omjsp3hr73fpy");
    expect(dbMeta.dbMeta.cars.map((i) => i.toString())).toEqual([
      "bag4yvqabciqchwosyt7u2j2lmpzr3l7idei55c3f6rvgu7qtfath2yv6vnikcyq",
    ]);
  });

  it("wal", async () => {
    const ref = {
      fileOperations: [
        {
          cid: "bafyreiaqmtw5jfudn6r6dq7mcmytc2z5z3ggohcj3gco3omjsp3hr73fpy",
          public: false,
        },
      ],
      noLoaderOps: [
        {
          cars: [
            {
              "/": "bag4yvqabciqchwosyt7u2j2lmpzr3l7idei55c3f6rvgu7qtfath2yv6vnikcyq",
            },
          ],
        },
      ],
      operations: [
        {
          cars: [{ "/": "bag4yvqabciqchwosyt7u2j2lmpzr3l7idei55c3f6rvgu7qtfath2yv6vnikcyq" }],
        },
      ],
    };
    const raw = sthis.txt.encode(JSON.stringify(ref));
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=wal").URI(), Result.Ok(raw));
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual(FPEnvelopeTypes.WAL);
    const walstate = res.unwrap().payload as WALState;
    expect(
      walstate.fileOperations.map((i) => ({
        ...i,
        cid: i.cid.toString(),
      })),
    ).toEqual(ref.fileOperations);
    expect(
      walstate.noLoaderOps.map((i) => ({
        cars: i.cars.map((i) => toJSON(i)),
      })),
    ).toEqual(ref.noLoaderOps);
    expect(
      walstate.operations.map((i) => ({
        cars: i.cars.map((i) => toJSON(i)),
      })),
    ).toEqual(ref.operations);
  });
});

describe("de-serialize", () => {
  const sthis = mockSuperThis();
  it("car", async () => {
    const msg = {
      type: FPEnvelopeTypes.CAR,
      payload: new Uint8Array([55, 56, 57]),
    } satisfies FPEnvelopeCar;
    const res = await fpSerialize(sthis, msg);
    expect(res.Ok()).toEqual(msg.payload);
  });

  it("file", async () => {
    const msg = {
      type: FPEnvelopeTypes.FILE,
      payload: new Uint8Array([55, 56, 57]),
    } satisfies FPEnvelopeFile;
    const res = await fpSerialize(sthis, msg);
    expect(res.Ok()).toEqual(msg.payload);
  });

  it("meta", async () => {
    const msg = {
      type: FPEnvelopeTypes.META,
      payload: [
        await createDbMetaEvent(
          sthis,
          {
            cars: [await simpleCID(sthis)],
          },
          [await simpleCID(sthis), await simpleCID(sthis)],
        ),
      ],
    } satisfies FPEnvelopeMeta;
    const ser = await fpSerialize(sthis, msg);
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=meta").URI(), ser);
    const dbMetas = res.unwrap().payload as DbMetaEvent[];
    expect(dbMetas.length).toBe(1);
    const dbMeta = dbMetas[0];
    expect(dbMeta.parents).toEqual(msg.payload[0].parents);
    expect(dbMeta.dbMeta).toEqual(msg.payload[0].dbMeta);
    expect(dbMeta.eventCid).toEqual(msg.payload[0].eventCid);
  });

  it("wal", async () => {
    const msg = {
      type: FPEnvelopeTypes.WAL,
      payload: {
        fileOperations: [
          {
            cid: await simpleCID(sthis),
            public: false,
          },
        ],
        noLoaderOps: [
          {
            cars: [await simpleCID(sthis)],
          },
        ],
        operations: [
          {
            cars: [await simpleCID(sthis)],
          },
        ],
      },
    } satisfies FPEnvelopeWAL;
    const ser = await fpSerialize(sthis, msg);
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=wal").URI(), ser);
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual("wal");
    const walstate = res.unwrap().payload as WALState;
    expect(walstate.fileOperations).toEqual(msg.payload.fileOperations);
    expect(walstate.noLoaderOps).toEqual(msg.payload.noLoaderOps);
    expect(walstate.operations).toEqual(msg.payload.operations);
  });

  it("coerce into fpDeserialize Result", async () => {
    const raw = new Uint8Array([55, 56, 57]);
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=car&suffix=.car").URI(), Result.Ok(raw));
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual(FPEnvelopeTypes.CAR);
    expect(res.unwrap().payload).toEqual(raw);
  });

  it("coerce into fpDeserialize Promise", async () => {
    const raw = new Uint8Array([55, 56, 57]);
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=car&suffix=.car").URI(), Promise.resolve(raw));
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual(FPEnvelopeTypes.CAR);
    expect(res.unwrap().payload).toEqual(raw);
  });

  it("coerce into fpDeserialize Promise Result", async () => {
    const raw = new Uint8Array([55, 56, 57]);
    const res = await fpDeserialize(
      sthis,
      BuildURI.from("http://x.com?store=car&suffix=.car").URI(),
      Promise.resolve(Result.Ok(raw)),
    );
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual(FPEnvelopeTypes.CAR);
    expect(res.unwrap().payload).toEqual(raw);
  });

  it("coerce into fpDeserialize Promise Result.Err", async () => {
    const raw = Promise.resolve(Result.Err<Uint8Array>("error"));
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=car&suffix=.car").URI(), raw);
    expect(res.isErr()).toBeTruthy();
    expect(res.unwrap_err().message).toEqual("error");
  });

  it("coerce into fpDeserialize Promise.reject", async () => {
    const raw = Promise.reject(new Error("error"));
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=car&suffix=.car").URI(), raw);
    expect(res.isErr()).toBeTruthy();
    expect(res.unwrap_err().message).toEqual("error");
  });

  it("coerce into fpDeserialize Result.Err", async () => {
    const raw = Result.Err<Uint8Array>("error");
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=car&suffix=.car").URI(), raw);
    expect(res.isErr()).toBeTruthy();
    expect(res.unwrap_err().message).toEqual("error");
  });

  it("attach Key to Meta", async () => {
    const msg = {
      type: FPEnvelopeTypes.META,
      payload: [
        await createDbMetaEvent(
          sthis,
          {
            cars: [await simpleCID(sthis)],
          },
          [await simpleCID(sthis), await simpleCID(sthis)],
        ),
      ],
    } satisfies FPEnvelopeMeta;
    const ser = await fpSerialize(sthis, msg, {
      meta: async (sthis, payload) => {
        return Result.Ok(sthis.txt.encode(JSON.stringify(payload.map((i) => ({ ...i, key: "key" })))));
      },
    });
    let key = "";
    const res = await fpDeserialize(sthis, BuildURI.from("http://x.com?store=meta").URI(), ser, {
      meta: async (sthis, payload) => {
        const json = JSON.parse(sthis.txt.decode(payload));
        key = json[0].key;
        return Result.Ok(
          json.map((i: { key?: string }) => {
            delete i.key;
            return i;
          }) as SerializedMeta[],
        );
      },
    });
    expect(res.isOk()).toBeTruthy();
    const meta = res.unwrap() as FPEnvelopeMeta;
    expect(meta.type).toEqual("meta");
    expect(Object.keys(meta.payload).includes("key")).toBeFalsy();
    expect(key).toEqual("key");
  });
});
