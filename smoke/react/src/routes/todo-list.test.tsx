import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import TodoList from "./Todo.js";

import { expect, describe, it } from "vitest";
import { Database, fireproof } from "use-fireproof";

describe("<TodoList />", () => {
  let fp: Database;
  afterEach(async () => {
    console.log("ae-pre-destroy");
    await fp.destroy();
    console.log("ae-post-destroy");
  });
  beforeEach(async () => {
    console.log("be-pre-create");
    fp = fireproof("TodoDB");
    const all = await fp.allDocs();
    for (const doc of all.rows) {
      await fp.del(doc.key);
    }
    console.log("be-post-create");
  });
  it("it will render an text input and a button", async () => {
    render(<TodoList />);
    expect(await screen.findByPlaceholderText("new todo here")).not.toBeNull();
    expect(await screen.findByText("Add Todo")).not.toBeNull();
    // await new Promise((r) => setTimeout(r, 2000));
  });

  it("it will add a new todo", async () => {
    render(<TodoList />);
    const input = (await screen.findByPlaceholderText("new todo here")) as HTMLInputElement;
    const button = await screen.findByText("Add Todo");

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
    // await new Promise((r) => setTimeout(r, 2000));
  });

  it("it will mark a todo as completed", async () => {
    render(<TodoList />);
    // add todo
    const input = await screen.findByPlaceholderText("new todo here");
    const button = await screen.findByText("Add Todo");
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
    // await new Promise((r) => setTimeout(r, 2000));
  });
});
