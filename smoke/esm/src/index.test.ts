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
    console.log("Server ping:", await fetch("http://localhost:4874/").then((r) => r.status));
    // eslint-disable-next-line no-console
    console.log(
      "Package ping:",
      await fetch(`http://localhost:4874/@fireproof/core@${(window as unknown as { FP_VERSION: string }).FP_VERSION}?no-dts`).then(
        (r) => r.status,
      ),
    );
    // eslint-disable-next-line no-console
    console.log(
      "use-fireproof ping:",
      await fetch(`http://localhost:4874/use-fireproof@${(window as unknown as { FP_VERSION: string }).FP_VERSION}?no-dts`).then(
        (r) => r.status,
      ),
    );
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
console.log("start script")
import { fireproof } from 'http://localhost:4874/@fireproof/core@${window.FP_VERSION}?no-dts'

console.log("window-js", window.FP_VERSION)
console.log("Fireproof module type:", typeof fireproof)
function invariant(cond, message) {
  if (!cond) {
    throw new Error(message)
  }
}
async function action(label, run) {
  console.log("Starting action run:", run)
  const db = fireproof("esm-test");
  console.log("DB created for run:", run)
  const ok = await db.put({ sort: Math.random(), test: "esm-success" });
  console.log("First doc put result:", ok.id)

  const beforeAll = await db.allDocs()
  console.log("beforeAll count:", beforeAll.rows.length)
  await db.put({ foo: 1 })
  const afterAll = await db.allDocs()
  console.log("afterAll count:", afterAll.rows.length)

  invariant(
     afterAll.rows.length == beforeAll.rows.length + 1,
     "all docs wrong count",
  )

  const res = await db.get(ok.id)
  console.log("Get result:", res.test)
  label.innerHTML = [run,res.test].join(' - ')
  await db.close()
  console.log("Completed action run:", run)
}

async function main() {
  console.log("Starting main function")
  const label = document.querySelector('label')
  for (let i = 0; i < 10; i++) {
    await action(label, i)
  }
  label.setAttribute("data-ready", "");
  console.log("Main function complete")
}
main().catch(e => {
  console.error("Main function error:", e)
})
`;
  script.type = "module";
  document.body.innerHTML = `<label data-testid="label" id="label"></label>`;
  console.log("adding script");
  document.body.appendChild(script);
  console.log("script added");
  await vi.waitUntil(() => document.querySelector("[data-ready]"), { timeout: 500_000 });
  expect(await page.getByTestId("label").element().innerHTML).toBe("9 - esm-success");
});
