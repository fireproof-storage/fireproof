import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TodoList from "./Todo.js";

import { expect, describe, it, beforeEach, afterEach } from "vitest";
import { Ledger, fireproof } from "use-fireproof";

describe("<TodoList />", () => {
  let fp: Ledger;
  afterEach(async () => {
    await fp.destroy();
  });
  beforeEach(async () => {
    fp = fireproof("TodoDB");
    const all = await fp.allDocs();
    for (const doc of all.rows) {
      await fp.del(doc.key);
    }
  });

  it("will render an input and a button", async () => {
    render(<TodoList />);
    expect(await screen.findByPlaceholderText("new todo here")).not.toBeNull();
    expect(await screen.findByText("Add Todo")).not.toBeNull();
  });

  it("will add a new todo", async () => {
    render(<TodoList />);
    const input = (await screen.findByPlaceholderText("new todo here")) as HTMLInputElement;
    const button = await screen.findByText("Add Todo");

    const todoText = `TEST-${Math.random()}`;

    // Add a todo
    fireEvent.change(input, { target: { value: todoText } });
    fireEvent.click(button);

    // Wait for it to appear
    await waitFor(() => {
      expect(screen.getByText(todoText)).not.toBeNull();
    });

    // Input should be cleared
    expect(input.value).toBe("");
  });

  it("will mark a todo as completed", async () => {
    render(<TodoList />);

    // Add a new todo
    const input = await screen.findByPlaceholderText("new todo here");
    const button = await screen.findByText("Add Todo");
    const value = `ToComplete(${Math.random()})`;
    fireEvent.change(input, { target: { value } });
    fireEvent.click(button);

    // Find the todo item that was added
    const item = await screen.findByText(value);
    expect(item).not.toBeNull();

    // Find and click the radio button
    const radio = item.parentNode?.querySelector("input[type=radio]") as HTMLInputElement;
    expect(radio).not.toBeNull();
    fireEvent.click(radio);

    // Find the editor and checkbox
    const textInput = await screen.findByDisplayValue(value);
    const checkBox = textInput.parentNode?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(checkBox.checked).toBe(false);

    // Check off todo
    fireEvent.click(checkBox);

    // Verify checkbox is checked
    await waitFor(() => {
      expect(checkBox.checked).toBe(true);
    });

    // Click save
    const saveButton = screen.getByText("Save Changes");
    fireEvent.click(saveButton);

    // Wait for the item to get updated with line-through style
    await waitFor(() => {
      // After the save, we need to find the item again
      const updatedItem = screen.getByText(value);

      // Check the element's style decoration
      expect(updatedItem.style.textDecoration).toBe("line-through");
    });
  });
});
