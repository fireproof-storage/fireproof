import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

it("iife", async () => {
  const script = document.createElement("script");
  script.textContent = `
import { fireproof } from 'http://localhost:4874/@fireproof/core'

async function main() {
  const db = fireproof("iife-test");
  const ok = await db.put({ sort: Math.random(), test: "iife-success" });

  const res = await db.get(ok.id)
  const label = document.querySelector('label')
  label.innerHTML = res.test
  label.setAttribute("data-ready", "");
}
main().catch(console.error)
`;
  script.type = "module";
  document.body.innerHTML = `<label data-testid="label" id="label"></label>`;
  document.body.appendChild(script);

  await vi.waitUntil(() => document.querySelector("[data-ready]"), { timeout: 500_000 });
  expect(await page.getByTestId("label").element().innerText).toBe("iife-success");
});
