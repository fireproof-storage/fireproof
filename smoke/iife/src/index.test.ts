import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

import "./index.js";

it("iife", async () => {
  // await page.goto("http://localhost:5173/browser/iife.html");
  // await page.waitForLoadState("domcontentloaded");

  // const ready = page.locator("[data-ready]");
  // await ready.waitFor();

  document.body.innerHTML = `<label data-testid="label" id="label"></label>`;

  console.log(document.querySelector("html").innerHTML);
  console.log(document.readyState);

  console.log(document.location.href);

  await vi.waitFor(() => {
    return new Promise((resolve) => {
      if (document.readyState === "complete") resolve();
      document.addEventListener("DOMContentLoaded", resolve);
    });
  }, 15_000);

  console.log("After:", document.body.innerHTML);

  const el = await vi.waitUntil(() => document.querySelector("[data-ready]"), { timeout: 500_000 });

  console.log("🪴", el);

  expect(await page.getByTestId("label").element().innerText).toBe("iife-success");
});
