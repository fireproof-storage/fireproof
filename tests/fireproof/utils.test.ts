import { URI } from "@adviser/cement";
import { ensureLogger, rt, getStore } from "@fireproof/core";

describe("utils", () => {
  const logger = ensureLogger({}, "getfilename");

  beforeAll(async () => {
    await rt.SysContainer.start();
  });

  it("sorts search params", () => {
    const url = URI.from("http://example.com?z=1&y=2&x=3");
    expect(url.toString()).toEqual("http://example.com/?x=3&y=2&z=1");
  });

  const storeOpts = [
    {
      type: "data",
      suffix: ".car",
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
      const url = URI.from(`file://./x/path?store=${store.type}&name=name&key=key&version=version`);
      expect(rt.getFileName(url, logger)).toEqual(`${store.type}/key${store.suffix}`);
    }
  });

  it("getfilename index", () => {
    for (const store of storeOpts) {
      const url = URI.from(`file://./x/path?index=idx&store=${store.type}&name=name&key=key&version=version`);
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
});
