import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

it("esm.sh", async () => {
  // Check if the module is available before proceeding
  const fpVersion = (window as unknown as { FP_VERSION: string }).FP_VERSION;
  const moduleUrl = `http://localhost:4874/@fireproof/core@${fpVersion}?no-dts`;
  const moduleUrlWithTag = `http://localhost:4874/@fireproof/core@${fpVersion}?tag=smoke&no-dts`;
  
  console.log(`Checking if module is available: ${moduleUrl} or ${moduleUrlWithTag}`);
  
  let moduleToUse = moduleUrl;
  
  try {
    // Try regular URL first
    const response = await fetch(moduleUrl);
    if (response.ok) {
      console.log(`Module is available at ${moduleUrl}. Status: ${response.status}`);
      moduleToUse = moduleUrl;
    } else {
      console.log(`Module not available at ${moduleUrl}. Status: ${response.status}`);
      
      // Try URL with tag
      const tagResponse = await fetch(moduleUrlWithTag);
      if (tagResponse.ok) {
        console.log(`Module is available at ${moduleUrlWithTag}. Status: ${tagResponse.status}`);
        moduleToUse = moduleUrlWithTag;
      } else {
        throw new Error(`Module not available with tag either. Status: ${tagResponse.status}`);
      }
    }
  } catch (error) {
    console.error(`Failed to fetch module: ${error.message}`);
    throw new Error(`Module not available at ${moduleUrl} or ${moduleUrlWithTag}: ${error.message}`);
  }

  const script = document.createElement("script");
  // eslint-disable-next-line no-console
  console.log("FP_VERSION", (window as unknown as { FP_VERSION: string }).FP_VERSION);
  // eslint-disable-next-line no-console
  console.log("FP_DEBUG", (window as unknown as { FP_DEBUG: string }).FP_DEBUG);
  // eslint-disable-next-line no-console
  console.log("FP_STACK", (window as unknown as { FP_STACK: string }).FP_STACK);
  // eslint-disable-next-line no-console
  console.log("Using module URL:", moduleToUse);

  script.textContent = `
//console.log("pre-window-js", window.FP_VERSION)
import { fireproof } from '${moduleToUse}'

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
