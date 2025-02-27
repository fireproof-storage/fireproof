import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

it("esm.sh", async () => {
  // Add a longer timeout for this test
  vi.setConfig({ testTimeout: 900_000 });

  const script = document.createElement("script");
  // eslint-disable-next-line no-console
  console.log("FP_VERSION", (window as unknown as { FP_VERSION: string }).FP_VERSION);
  // eslint-disable-next-line no-console
  console.log("FP_DEBUG", (window as unknown as { FP_DEBUG: string }).FP_DEBUG);
  // eslint-disable-next-line no-console
  console.log("FP_STACK", (window as unknown as { FP_STACK: string }).FP_STACK);

  // Create a more visible and accessible label
  document.body.innerHTML = `
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999;">
      <label data-testid="label" id="label" style="display: block; padding: 20px; background: white; border: 1px solid black;">Waiting for test...</label>
    </div>
  `;

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
    // Add a small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  label.setAttribute("data-ready", "");
}
main().catch(err => {
  console.error("Test error:", err)
  document.querySelector('label').innerHTML = "ERROR: " + err.message
  document.querySelector('label').setAttribute("data-ready", "error");
})
`;
  script.type = "module";
  document.body.appendChild(script);

  // Wait for 5 seconds before checking for the data-ready attribute
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Wait for the test to complete with a long timeout
  await vi.waitUntil(() => document.querySelector("[data-ready]"), { timeout: 900_000 });

  // Add a small delay to ensure the UI is stable
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const label = await page.getByTestId("label").element();
  const content = await label.innerHTML;

  // Check if there was an error
  if (content.startsWith("ERROR:")) {
    throw new Error(`Test failed with error: ${content}`);
  }

  expect(content).toBe("9 - esm-success");
});
