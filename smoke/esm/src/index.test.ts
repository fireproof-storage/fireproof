import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

it("esm.sh", async () => {
  const script = document.createElement("script");
  // eslint-disable-next-line no-console
  console.log("FP_VERSION", (window as unknown as { FP_VERSION: string }).FP_VERSION);
  // eslint-disable-next-line no-console
  console.log("FP_DEBUG", (window as unknown as { FP_DEBUG: string }).FP_DEBUG);
  // eslint-disable-next-line no-console
  console.log("FP_STACK", (window as unknown as { FP_STACK: string }).FP_STACK);
  
  // Check server connectivity
  try {
    // eslint-disable-next-line no-console
    console.log("Server ping:", await fetch("http://localhost:4874/").then(r => r.status));
    // eslint-disable-next-line no-console
    console.log("Package ping:", await fetch(`http://localhost:4874/@fireproof/core@${(window as unknown as { FP_VERSION: string }).FP_VERSION}?no-dts`).then(r => r.status));
    // eslint-disable-next-line no-console
    console.log("use-fireproof ping:", await fetch(`http://localhost:4874/use-fireproof@${(window as unknown as { FP_VERSION: string }).FP_VERSION}?no-dts`).then(r => r.status));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log("Server error:", e);
  }
  
  // const res = await fetch(`http://localhost:4874/@fireproof/core@${window.FP_VERSION}?no-dts`);
  // // console.log("window-res", await res.text());
  // const { fireproof } = await import(/* @vite-ignore */ `http://localhost:4874/@fireproof/core@${window.FP_VERSION}?no-dts`);
  // // console.log("window-imp", fireproof);

  script.textContent = `
//console.log("pre-window-js", window.FP_VERSION)
import { fireproof } from 'http://localhost:4874/@fireproof/core@${window.FP_VERSION}?no-dts'

console.log("window-js", window.FP_VERSION)
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
