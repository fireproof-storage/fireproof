import { runtimeFn, URI } from "@adviser/cement";
import { rt, getStore, ensureSuperLog, inplaceFilter } from "@fireproof/core";
import { mockSuperThis } from "../helpers.js";
import { UUID } from "uuidv7";

describe("utils", () => {
  const sthis = mockSuperThis({});
  const logger = ensureSuperLog(sthis, "getfilename");

  beforeAll(async () => {
    await sthis.start();
  });

  it("sorts search params", () => {
    const url = URI.from("http://example.com?z=1&y=2&x=3");
    expect(url.toString()).toEqual("http://example.com/?x=3&y=2&z=1");
  });

  const storeOpts = [
    {
      type: "data",
      suffix: ".tar",
    },
    {
      type: "wal",
      suffix: ".json",
    },
    {
      type: "meta",
      suffix: ".json",
    },
  ];
  it("getfilename plain", () => {
    for (const store of storeOpts) {
      const url = URI.from(`file://./x/path?store=${store.type}&name=name&key=key&version=version&suffix=${store.suffix}`);
      expect(rt.getFileName(url, logger)).toEqual(`${store.type}/key${store.suffix}`);
    }
  });

  it("getfilename index", () => {
    for (const store of storeOpts) {
      const url = URI.from(
        `file://./x/path?index=idx&store=${store.type}&name=name&key=key&version=version&suffix=${store.suffix}`,
      );
      expect(rt.getFileName(url, logger)).toEqual(`idx-${store.type}/key${store.suffix}`);
    }
  });

  it("getstore", () => {
    for (const store of storeOpts) {
      const url = URI.from(`file://./x/path?store=${store.type}&name=name&key=key&version=version`);
      expect(getStore(url, logger, (...toJoin) => toJoin.join("+"))).toEqual({
        name: store.type,
        store: store.type,
      });
    }
  });

  it("getstore idx", () => {
    for (const store of storeOpts) {
      const url = URI.from(`file://./x/path?index=ix&store=${store.type}&name=name&key=key&version=version`);
      expect(getStore(url, logger, (...toJoin) => toJoin.join("+"))).toEqual({
        name: `ix+${store.type}`,
        store: store.type,
      });
    }
  });

  it("order timeorderednextid", () => {
    let last = sthis.timeOrderedNextId().str;
    for (let i = 0; i < 10; i++) {
      const id = sthis.timeOrderedNextId().str;
      const x = UUID.parse(id);
      expect(x.getVariant()).toBe("VAR_10");
      assert(id !== last, "id should be greater than last");
      assert(id.slice(0, 13) >= last.slice(0, 13), `id should be greater than last ${id.slice(0, 13)} ${last.slice(0, 13)}`);
      last = id;
    }
  });
  it("timeorderednextid is uuidv7", () => {
    const id = sthis.timeOrderedNextId(0xcafebabebeef).str;
    expect(id.slice(0, 15)).toBe("cafebabe-beef-7");
  });

  it("inplaceFilter empty", () => {
    const s: string[] = [];
    expect(inplaceFilter(s, () => false)).toEqual([]);
    expect(inplaceFilter(s, () => true)).toEqual([]);
  });

  it("inplaceFilter sized filtered", () => {
    const s = new Array(100).fill("a").map((a, i) => `${a}${i.toString()}`);
    expect(inplaceFilter(s, () => false)).toEqual([]);
  });
  it("inplaceFilter sized unfiltered", () => {
    const s = new Array(100).fill("a").map((a, i) => `${a}${i.toString()}`);
    const ref = [...s];
    expect(inplaceFilter(s, () => true)).toEqual(ref);
  });

  it("inplaceFilter sized mod 7", () => {
    const s = new Array(100).fill("a").map((a, i) => `${a}${i.toString()}`);
    const ref = [...s];
    for (let i = 99; i >= 0; i--) {
      if (!(i % 7)) {
        ref.splice(i, 1);
      }
    }
    expect(inplaceFilter(s, (_, j) => !!(j % 7))).toEqual(ref);
    expect(s.length).toBe(85);
  });
});

describe("runtime", () => {
  it("runtime", () => {
    const isNode = !!(typeof process === "object" && process.versions?.node);
    expect(runtimeFn()).toEqual({
      isBrowser: !isNode,
      isCFWorker: false,
      isDeno: false,
      isNodeIsh: isNode,
      isReactNative: false,
    });
  });
});
