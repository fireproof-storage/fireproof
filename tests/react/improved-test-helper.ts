// Test helper functions for React hooks
import { renderHook as originalRenderHook, RenderHookResult } from "@testing-library/react";
import { act } from "react-dom/test-utils";

/**
 * Enhanced renderHook that provides a way to interact with hooks
 * without violating Rules of Hooks
 */
export function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  options?: { initialProps?: Props },
): RenderHookResult<Result, Props> & {
  act: typeof act;
  performAction: <T>(action: () => T) => Promise<T>;
} {
  const result = originalRenderHook(callback, options);

  // Extend the result with a method to perform actions on the rendered hook
  const extendedResult = {
    ...result,
    act,
    // Use act for consistent behavior with hook actions
    performAction: async <T>(action: () => T): Promise<T> => {
      let returnValue!: T; // Use definite assignment assertion
      await act(async () => {
        returnValue = action();
      });
      return returnValue;
    },
  };

  return extendedResult;
}

/**
 * Helper function to wait until a condition is met
 */
export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const startTime = Date.now();

  while (true) {
    const result = await Promise.resolve(condition());
    if (result) return;

    if (Date.now() - startTime > timeout) {
      throw new Error(`Condition not met within ${timeout}ms timeout`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
