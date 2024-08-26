import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rt, Database, useFireproof } from "use-fireproof";
import { generateTexts, getUseFireproofHook, populateDatabase, Todo } from "../helpers";

const TEST_DB_NAME = "test-useLiveQuery";

describe("HOOK: useLiveQuery", () => {
  let db: Database;
  const texts = generateTexts();

  afterEach(async () => {
    cleanup();
    await db.close();
    await db.destroy();
  });

  beforeEach(async () => {
    await rt.SysContainer.start();
    db = new Database(TEST_DB_NAME);
  });

  it("should be defined", async () => {
    const useFireproofHook = getUseFireproofHook(db);
    const { useLiveQuery } = useFireproofHook.result.current;
    expect(useLiveQuery).toBeDefined();
  });

  it("renders the hook correctly and checks types", () => {
    const useFireproofHook = getUseFireproofHook(db);
    const { useLiveQuery } = useFireproofHook.result.current;
    expect(typeof useLiveQuery).toBe("function");
  });

  it("reads from the database", async () => {
    // populate database with test data
    await populateDatabase(db, texts);

    // render component
    const { getByText } = render(<TestComponent />);

    await waitFor(() => {
      const countTxt = getByText("count: 10");
      expect(countTxt).toBeTruthy();
    });
  });
});

function TestComponent() {
  const { useLiveQuery } = useFireproof(TEST_DB_NAME);
  const todos = useLiveQuery<Todo>("date", { limit: 10, descending: true });
  return (
    <div>
      <p>count: {todos.docs.length}</p>
      <ul>
        {todos.docs.map((todo) => (
          <li key={todo._id}>{todo.text}</li>
        ))}
      </ul>
    </div>
  );
}
