import { renderHook } from "@solidjs/testing-library";
import { expect, describe, it } from "vitest";
import { createLiveQuery } from "../createLiveQuery";

describe("HOOK: createLiveQuery", () => {
  it("can be used as expected", async () => {
    const { result } = renderHook(() => createLiveQuery("dbname"));

    expect(result()).toEqual({ rows: [], docs: [] });
    await createLiveQuery.database().put({ _id: "1", good: true });
    expect(result().rows.length).toBe(1);
  });
});
