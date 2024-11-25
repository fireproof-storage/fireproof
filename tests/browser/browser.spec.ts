import { test, expect } from "@playwright/test";

test("iife", async ({ page }) => {
  await page.goto("http://localhost:5173/browser/iife.html");
  await page.waitForLoadState("domcontentloaded");

  const ready = page.locator("[data-ready]");
  await ready.waitFor();

  expect(await page.getByTestId("label").innerText()).toBe("iife-success");
});
