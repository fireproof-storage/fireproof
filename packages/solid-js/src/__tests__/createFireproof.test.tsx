import { renderHook } from "@solidjs/testing-library";
import { createFireproof } from "../createFireproof";
import { expect, describe, it } from "vitest";

describe("HOOK: createFireproof", () => {
  it("returns the expected result fields", () => {
    const { result } = renderHook(() => createFireproof("dbname"));
    const { database, createLiveQuery, createDocument } = result;

    expect(typeof createLiveQuery).toBe("function");
    expect(typeof createDocument).toBe("function");
    expect(typeof database).toBe("function");
    expect(database().constructor.name).toBe("Database");
  });

  it("can use createLiveQuery", async () => {
    const { result } = renderHook(() => createFireproof("dbname"));
    const { database, createLiveQuery } = result;

    const completedTodos = createLiveQuery("completed", { limit: 10 });
    expect(completedTodos().rows.length).toBe(0);

    await database().put({ _id: "1", good: true });
    expect(completedTodos().rows.length).toBe(1);
  });
});
