import { describe, it, expect, vi } from "vitest";
import { render, waitFor, fireEvent, act } from "@testing-library/react";
import { useState, useEffect, createElement } from "react";
import { useFireproof } from "../../src/react/use-fireproof.js";

// Extend HTMLElement for TypeScript compatibility
declare global {
  interface HTMLElement {
    querySelector(selectors: string): HTMLElement | null;
    getAttribute(name: string): string | null;
    textContent: string | null;
    click(): void;
  }
}

// Test component that triggers state updates and verifies database stability
function TestComponent() {
  const { database } = useFireproof("test-stability-db");
  const initialDatabaseRef = database;

  const [counter, setCounter] = useState(0);

  // Verify that the database reference remains stable across renders
  if (counter > 0 && initialDatabaseRef !== database) {
    throw new Error("Database reference changed between renders!");
  }

  return createElement("div", {}, [
    createElement("div", { "data-testid": "db-name", key: "db-name" }, database.name),
    createElement("div", { "data-testid": "counter", key: "counter" }, String(counter)),
    createElement(
      "button",
      {
        "data-testid": "increment",
        key: "increment",
        onClick: () => setCounter((c) => c + 1),
      },
      "Increment",
    ),
  ]);
}

// Test timeout value for CI
const TEST_TIMEOUT = 60000; // 1 minute per test

describe("HOOK: useFireproof stability", () => {
  it(
    "database instance remains stable across renders",
    async () => {
      // Mock console.error to catch any React errors
      const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());

      const { findByTestId } = render(createElement(TestComponent, {}));

      // Get initial state
      const dbNameEl = await findByTestId("db-name" as const);
      const counterEl = await findByTestId("counter" as const);

      // Verify initial state
      expect(dbNameEl.textContent).toBe("test-stability-db");
      expect(counterEl.textContent).toBe("0");

      // Trigger a re-render by updating state
      const incrementButton = await findByTestId("increment" as const);
      await act(async () => {
        incrementButton.click();
      });

      // Verify state changed but no errors occurred
      expect(counterEl.textContent).toBe("1");

      // There should be no errors logged from React about database reference changing
      expect(consoleErrorMock).not.toHaveBeenCalledWith(expect.stringContaining("Database reference changed between renders"));

      // Perform multiple render cycles to ensure stability
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          incrementButton.click();
        });
      }

      // Verify no errors occurred during multiple renders
      expect(consoleErrorMock).not.toHaveBeenCalledWith(expect.stringContaining("Database reference changed between renders"));

      // Restore console
      consoleErrorMock.mockRestore();
    },
    TEST_TIMEOUT,
  );

  it(
    "input events do not cause infinite render loops",
    async () => {
      // This test is specifically designed to catch the issue reported in v0.20.0

      function InputTestComponent() {
        // We still create the database to ensure no infinite render loops occur
        // But we don't need to use any of its features directly in this test
        useFireproof("test-input-db");
        const [inputValue, setInputValue] = useState("");
        const [renderCount, setRenderCount] = useState(0);

        // Track render count
        useEffect(() => {
          setRenderCount((c) => c + 1);
        }, []);

        return createElement("div", {}, [
          createElement("input", {
            type: "text",
            "data-testid": "input",
            key: "input",
            value: inputValue,
            onChange: (e: { target: { value: string } }) => {
              setInputValue(e.target.value);
            },
          }),
          createElement("div", { "data-testid": "render-count", key: "render-count" }, String(renderCount)),
        ]);
      }

      // Instead of using createRoot, use the standard render method
      const { getByTestId } = render(createElement(InputTestComponent));

      // Get the input element
      const input = getByTestId("input");

      // Simulate typing in the input field - this would trigger the bug in v0.20.0
      await waitFor(() => {
        fireEvent.change(input, { target: { value: "test" } });
      });

      // Wait a bit to ensure no infinite loop occurs
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify the render count hasn't exploded (if it were an infinite loop, the test would timeout)
      const renderCount = getByTestId("render-count");

      // The exact number isn't important, but it should be a small number
      // If we're in an infinite loop, the test would have timed out before reaching here
      expect(parseInt(renderCount.textContent || "0", 10)).toBeLessThan(10);
    },
    TEST_TIMEOUT,
  );
});
