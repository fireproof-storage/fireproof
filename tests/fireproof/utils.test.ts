import { ensureLogger, sanitizeURL, rt, getStore } from "@fireproof/core";
import { SysContainer } from "../../src/runtime";

describe("utils", () => {
  const logger = ensureLogger({}, "getfilename");

  beforeAll(async () => {
    await SysContainer.start();
  });

  it("sorts search params", () => {
    const url = new URL("http://example.com?z=1&y=2&x=3");
    sanitizeURL(url);
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
      const url = new URL(`file://./x/path?store=${store.type}&name=name&key=key&version=version`);
      expect(rt.getFileName(url, "foo", logger)).toEqual(`${store.type}/foo${store.suffix}`);
    }
  });

  it("getfilename index", () => {
    for (const store of storeOpts) {
      const url = new URL(`file://./x/path?index=idx&store=${store.type}&name=name&key=key&version=version`);
      expect(rt.getFileName(url, "foo", logger)).toEqual(`idx-${store.type}/foo${store.suffix}`);
    }
  });

  it("getstore", () => {
    for (const store of storeOpts) {
      const url = new URL(`file://./x/path?store=${store.type}&name=name&key=key&version=version`);
      expect(getStore(url, logger, (...toJoin) => toJoin.join("+"))).toEqual({
        name: store.type,
        store: store.type,
      });
    }
  });

  it("getstore idx", () => {
    for (const store of storeOpts) {
      const url = new URL(`file://./x/path?index=ix&store=${store.type}&name=name&key=key&version=version`);
      expect(getStore(url, logger, (...toJoin) => toJoin.join("+"))).toEqual({
        name: `ix+${store.type}`,
        store: store.type,
      });
    }
  });
});
