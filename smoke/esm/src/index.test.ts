import { page } from "vitest/browser";
import { expect, it, vi } from "vitest";

interface FPWindow extends Window {
  FP_VERSION: string;
  FP_DEBUG: string;
  FP_STACK: string;
  FP_ESM: string;
}

it("esm.sh", async () => {
  const script = document.createElement("script");
  const fpWindow = window as unknown as FPWindow;
  // eslint-disable-next-line no-console
  console.log("FP_VERSION", fpWindow.FP_VERSION);
  // eslint-disable-next-line no-console
  console.log("FP_DEBUG", fpWindow.FP_DEBUG);
  // eslint-disable-next-line no-console
  console.log("FP_STACK", fpWindow.FP_STACK);
  // eslint-disable-next-line no-console
  console.log("FP_ESM", fpWindow.FP_ESM);

  script.textContent = `
//console.log("pre-window-js", window.FP_VERSION)
import { fireproof } from '${fpWindow.FP_ESM ?? "http://localhost:4874"}/use-fireproof@${fpWindow.FP_VERSION}'

console.log("SCRIPT FP_VERSION", window.FP_VERSION)
function invariant(cond, message) {
  if (!cond) {
    throw new Error(message)
  }
}
async function action(label, run) {
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
  label.innerHTML = [run,res.test].join(' - ')
  await db.close()
}

async function main() {
  const label = document.querySelector('label')
  for (let i = 0; i < 10; i++) {
    await action(label, i)
  }
  label.setAttribute("data-ready", "");
}
main().catch(console.error)
`;
  script.type = "module";
  document.body.innerHTML = `<label data-testid="label" id="label"></label>`;
  document.body.appendChild(script);

  await vi.waitUntil(() => document.querySelector("[data-ready]"), { timeout: 500_000 });
  expect(await page.getByTestId("label").element().innerHTML).toBe("9 - esm-success");
});
