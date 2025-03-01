import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

it("esm.sh", async () => {
  console.log(" ESM TEST STARTING: Checking environment variables and module availability");

  // Check if the module is available before proceeding
  const fpVersion = (window as unknown as { FP_VERSION: string }).FP_VERSION;
  if (!fpVersion) {
    console.error(" CRITICAL ERROR: FP_VERSION is not defined in window");
    throw new Error("FP_VERSION is not defined in window - test environment setup issue");
  }
  console.log(` FP_VERSION found: ${fpVersion}`);

  const moduleUrl = `http://localhost:4874/@fireproof/core@${fpVersion}?no-dts`;
  const moduleUrlWithTag = `http://localhost:4874/@fireproof/core@${fpVersion}?tag=smoke&no-dts`;

  console.log(` Checking module availability at primary URL: ${moduleUrl}`);

  let moduleToUse = moduleUrl;
  let moduleResponse = null;

  try {
    // Try regular URL first
    const startTime = Date.now();
    const response = await fetch(moduleUrl);
    const fetchTime = Date.now() - startTime;

    if (response.ok) {
      console.log(` Module is available. Status: ${response.status}, Fetch time: ${fetchTime}ms`);
      moduleToUse = moduleUrl;
      moduleResponse = response;
    } else {
      console.log(` Module not available at primary URL. Status: ${response.status}`);

      // Try URL with tag
      console.log(` Checking alternative URL: ${moduleUrlWithTag}`);
      const tagStartTime = Date.now();
      const tagResponse = await fetch(moduleUrlWithTag);
      const tagFetchTime = Date.now() - tagStartTime;

      if (tagResponse.ok) {
        console.log(` Module is available with tag. Status: ${tagResponse.status}`);
        moduleToUse = moduleUrlWithTag;
        moduleResponse = tagResponse;
      } else {
        console.error(` Module not available with tag either. Status: ${tagResponse.status}`);
        throw new Error(`Module not available at either URL`);
      }
    }

    // Verify module content
    if (moduleResponse) {
      const moduleText = await moduleResponse.text();
      const contentLength = moduleText.length;
      console.log(` Module content received. Size: ${contentLength} bytes`);

      if (contentLength < 100) {
        console.error(` Module content suspiciously small (${contentLength} bytes)`);
        throw new Error(`Module content is suspiciously small: ${contentLength} bytes`);
      }

      // Check for basic expected content in the module
      if (!moduleText.includes("fireproof")) {
        console.error(` Module content does not contain expected 'fireproof' string`);
        throw new Error(`Module content validation failed - missing expected content`);
      }
    }
  } catch (error) {
    console.error(` Failed to fetch module: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    throw new Error(`Module not available: ${error.message}`);
  }

  console.log(" Creating script element and setting up test environment");
  const script = document.createElement("script");

  // Log environment variables
  console.log(" Environment variables:");
  console.log("  FP_VERSION:", (window as unknown as { FP_VERSION: string }).FP_VERSION);
  console.log("  FP_DEBUG:", (window as unknown as { FP_DEBUG: string }).FP_DEBUG);
  console.log("  FP_STACK:", (window as unknown as { FP_STACK: string }).FP_STACK);
  console.log("  Using module URL:", moduleToUse);

  script.textContent = `
import { fireproof } from '${moduleToUse}'

console.log(" Module imported successfully")

function invariant(cond, message) {
  if (!cond) {
    console.error(" INVARIANT FAILED:", message);
    throw new Error(message)
  }
}

async function action(label, iteration) {
  console.log(" Running iteration " + iteration + "/10");
  try {
    const db = fireproof("esm-test");
    
    const ok = await db.put({ sort: Math.random(), test: "esm-success" });
    
    const beforeAll = await db.allDocs();
    
    await db.put({ foo: 1 });
    
    const afterAll = await db.allDocs();

    invariant(
      afterAll.rows.length == beforeAll.rows.length + 1,
      "all docs wrong count: before=" + beforeAll.rows.length + ", after=" + afterAll.rows.length
    );

    const res = await db.get(ok.id);
    
    label.innerHTML = [iteration,res.test].join(' - ');
    
    await db.close();
    
    return true;
  } catch (error) {
    console.error(" Error in iteration " + iteration + ": " + error.message);
    label.innerHTML = "ERROR: " + error.message;
    throw error;
  }
}

async function main() {
  const label = document.querySelector('label');
  if (!label) {
    throw new Error("Label element not found");
  }
  
  for (let i = 0; i < 10; i++) {
    await action(label, i);
  }
  
  label.setAttribute("data-ready", "");
}

main().catch(error => {
  console.error(" FATAL ERROR in main():", error.message);
});
`;
  script.type = "module";

  console.log(" Setting up DOM elements");
  document.body.innerHTML = `<label data-testid="label" id="label">Test running...</label>`;
  document.body.appendChild(script);
  console.log(" Script appended to document body");

  console.log(" Waiting for test completion (data-ready attribute)");
  try {
    await vi.waitUntil(
      () => {
        const element = document.querySelector("[data-ready]");
        return element;
      },
      {
        timeout: 500_000,
        interval: 5000, // Check less frequently to reduce log spam
      },
    );

    const labelContent = await page.getByTestId("label").element().innerHTML;
    console.log(` Final label content: "${labelContent}"`);
    expect(labelContent).toBe("9 - esm-success");
  } catch (error) {
    console.error(` Test failed during waitUntil: ${error.message}`);

    // Try to capture the current state for debugging
    try {
      const currentLabel = document.querySelector("label");
      console.error(`Current label content: "${currentLabel?.innerHTML}"`);
    } catch (e) {
      console.error(`Failed to capture debug state: ${e.message}`);
    }

    throw error;
  }
});
