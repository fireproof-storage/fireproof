import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import TodoList from "./Todo.js";

import { expect, describe, test } from "vitest";
import { fireproof } from "use-fireproof";

describe("<TodoList />", () => {
  // beforeAll(async () => {
  //   const action = indexedDB.deleteDatabase("fp.0.18.0.TodoDB");
  //   await new Promise<void>((rs, rj) => {
  //     action.onsuccess = () => {
  //       console.log("deleted");
  //       rs();
  //     };
  //     action.onerror = () => {
  //       console.log("error", action.error);
  //       rj(action.error);
  //     };
  //   });
  // });
  beforeEach(async () => {
    const fp = fireproof("TodoDB");
    const all = await fp.allDocs();
    for (const doc of all.rows) {
      await fp.del(doc.key);
    }
  });
  test("it will render an text input and a button", () => {
    render(<TodoList />);
    expect(screen.getByPlaceholderText("new todo here")).not.toBeNull();
    expect(screen.getByText("Add Todo")).not.toBeNull();
  });

  test("it will add a new todo", async () => {
    render(<TodoList />);
    const input = screen.getByPlaceholderText("new todo here") as HTMLInputElement;
    const button = screen.getByText("Add Todo");

    const values = Array(10)
      .fill(0)
      .map((_, i) => `TEST(${i}:${Math.random()})`);
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      await fireEvent.change(input, { target: { value } });
      await fireEvent.click(button);
      expect(await screen.findByText(value), `Element:${i}:${value}`).not.toBeNull();
      expect(input.value).toBe("");
    }
    // await new Promise((r) => setTimeout(r, 200));
  });

  test("it will mark a todo as completed", async () => {
    render(<TodoList />);
    // add todo
    const input = screen.getByPlaceholderText("new todo here");
    const button = screen.getByText("Add Todo");
    const value = `ToComplete(${Math.random()})`;
    await fireEvent.change(input, { target: { value } });
    await fireEvent.click(button);

    // open editor
    const item = await screen.findByText(value);
    expect(item).not.toBeNull();
    const radio = item.parentNode?.querySelector("input[type=radio]") as HTMLInputElement;
    await fireEvent.click(radio);

    // check off todo
    const textInput = (await screen.findByDisplayValue(value)) as HTMLInputElement;
    const checkBox = textInput.parentNode?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(checkBox.checked).toBe(false);
    await fireEvent.click(checkBox);

    await waitFor(() => {
      expect(checkBox.checked).toBe(true);
    });
    expect(item.attributeStyleMap.get("text-decoration")?.toString()).toBe("line-through");
  });
});
