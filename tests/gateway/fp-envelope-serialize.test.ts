import { rt, bs } from "@fireproof/core";
import { mockSuperThis, simpleCID } from "../helpers";
import { BuildURI } from "@adviser/cement";
import { toJSON } from "multiformats/link";

describe("storage-content", () => {
  const sthis = mockSuperThis();
  it("car", async () => {
    const raw = new Uint8Array([55, 56, 57]);
    const res = await rt.gw.fpDeserialize(sthis, raw, BuildURI.from("http://x.com?store=data&suffix=.car").URI());
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual("car");
    expect(res.unwrap().payload).toEqual(raw);
  });

  it("file", async () => {
    const raw = new Uint8Array([55, 56, 57]);
    const res = await rt.gw.fpDeserialize(sthis, raw, BuildURI.from("http://x.com?store=data").URI());
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual("file");
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
    const res = await rt.gw.fpDeserialize(sthis, raw, BuildURI.from("http://x.com?store=meta").URI());
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual("meta");
    const dbMetas = res.unwrap().payload as bs.DbMetaEvent[];
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
    const res = await rt.gw.fpDeserialize(sthis, raw, BuildURI.from("http://x.com?store=wal").URI());
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual("wal");
    const walstate = res.unwrap().payload as bs.WALState;
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
      type: "car",
      payload: new Uint8Array([55, 56, 57]),
    } satisfies bs.FPEnvelopeCar;
    const res = await rt.gw.fpSerialize(sthis, msg, BuildURI.from("http://x.com?store=data&suffix=.car").URI());
    expect(res).toEqual(msg.payload);
  });

  it("file", async () => {
    const msg = {
      type: "file",
      payload: new Uint8Array([55, 56, 57]),
    } satisfies bs.FPEnvelopeFile;
    const res = await rt.gw.fpSerialize(sthis, msg, BuildURI.from("http://x.com?store=data").URI());
    expect(res).toEqual(msg.payload);
  });

  it("meta", async () => {
    const msg = {
      type: "meta",
      payload: [
        await bs.createDbMetaEvent(
          sthis,
          {
            cars: [await simpleCID(sthis)],
          },
          [await simpleCID(sthis), await simpleCID(sthis)],
        ),
      ],
    } satisfies bs.FPEnvelopeMeta;
    const ser = await rt.gw.fpSerialize(sthis, msg, BuildURI.from("http://x.com?store=meta").URI());
    const res = await rt.gw.fpDeserialize(sthis, ser, BuildURI.from("http://x.com?store=meta").URI());
    const dbMetas = res.unwrap().payload as bs.DbMetaEvent[];
    expect(dbMetas.length).toBe(1);
    const dbMeta = dbMetas[0];
    expect(dbMeta.parents).toEqual(msg.payload[0].parents);
    expect(dbMeta.dbMeta).toEqual(msg.payload[0].dbMeta);
    expect(dbMeta.eventCid).toEqual(msg.payload[0].eventCid);
  });

  it("wal", async () => {
    const msg = {
      type: "wal",
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
    } satisfies bs.FPEnvelopeWAL;
    const ser = await rt.gw.fpSerialize(sthis, msg, BuildURI.from("http://x.com?store=wal").URI());
    const res = await rt.gw.fpDeserialize(sthis, ser, BuildURI.from("http://x.com?store=wal").URI());
    expect(res.isOk()).toBeTruthy();
    expect(res.unwrap().type).toEqual("wal");
    const walstate = res.unwrap().payload as bs.WALState;
    expect(walstate.fileOperations).toEqual(msg.payload.fileOperations);
    expect(walstate.noLoaderOps).toEqual(msg.payload.noLoaderOps);
    expect(walstate.operations).toEqual(msg.payload.operations);
  });
});
