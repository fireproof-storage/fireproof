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
  it.skip("it will render an text input and a button", async () => {
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
    console.log("pre-last");
    render(<TodoList />);
    console.log("pre-0");
    // add todo
    const input = await screen.findByPlaceholderText("new todo here");
    const button = await screen.findByText("Add Todo");
    const value = `ToComplete(${Math.random()})`;
    await fireEvent.change(input, { target: { value } });
    await fireEvent.click(button);
    console.log("pre-1");

    // open editor
    const item = await screen.findByText(value);
    console.log("pre-1.0");
    expect(item).not.toBeNull();
    console.log("pre-1.1");
    const radio = item.parentNode?.querySelector("input[type=radio]") as HTMLInputElement;
    console.log("pre-1.2");
    await fireEvent.click(radio);
    console.log("pre-2");

    // check off todo
    const textInput = (await screen.findByDisplayValue(value)) as HTMLInputElement;
    const checkBox = textInput.parentNode?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(checkBox.checked).toBe(false);
    await fireEvent.click(checkBox);
    console.log("pre-3");

    await waitFor(() => {
      expect(checkBox.checked).toBe(true);
    });
    console.log("pre-4");
    expect(item.attributeStyleMap.get("text-decoration")?.toString()).toBe("line-through");
    console.log("post-last");
    // await new Promise((r) => setTimeout(r, 2000));
  });
});
