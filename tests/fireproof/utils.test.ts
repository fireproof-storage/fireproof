import { sanitizeURL } from "@fireproof/core";

describe("utils", () => {
  it("sorts search params", () => {
    const url = new URL("http://example.com?z=1&y=2&x=3");
    sanitizeURL(url);
    expect(url.toString()).toEqual("http://example.com/?x=3&y=2&z=1");
  });
});
