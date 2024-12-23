import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

it("esm.sh", async () => {
  const script = document.createElement("script");
  script.textContent = `
import { fireproof } from 'http://localhost:4874/@fireproof/core'

function invariant(cond, message) {
  if (!cond) {
    throw new Error(message)
  }
}
async function action(run) {
  const db = fireproof("esm-test");
  const ok = await db.put({ sort: Math.random(), test: "esm-success" });

  const beforeAll = await db.allDocs()
  await db.put({ foo: 1 })
  const afterAll = await db.allDocs()

  invariant(
     afterAll.rows.length == beforeAll.rows.length + 1,
     "all docs wrong count",
  )

  const res = await db.get(ok.id)
  const label = document.querySelector('label')
  label.innerHTML = [run,res.test].join(' - ')
  await db.close()
}

async function main() {
  for (let i = 0; i < 10; i++) {
    await action(i)
  }
  label.setAttribute("data-ready", "");
}
main().catch(console.error)
`;
  script.type = "module";
  document.body.innerHTML = `<label data-testid="label" id="label"></label>`;
  document.body.appendChild(script);

  await vi.waitUntil(() => document.querySelector("[data-ready]"), { timeout: 500_000 });
  expect(await page.getByTestId("label").element().innerText).toBe("9 - esm-success");
});
