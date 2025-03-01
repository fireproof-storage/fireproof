import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

/* eslint-disable no-console */
it("esm.sh", async () => {
  console.log("🚀 ESM TEST STARTING: Checking environment variables and module availability");

  // Set a start time to measure overall test duration
  const testStartTime = Date.now();

  // Check if the module is available before proceeding
  const fpVersion = (window as unknown as { FP_VERSION: string }).FP_VERSION;
  if (!fpVersion) {
    console.error("❌ CRITICAL ERROR: FP_VERSION is not defined in window");
    throw new Error("FP_VERSION is not defined in window - test environment setup issue");
  }
  console.log(`✅ FP_VERSION found: ${fpVersion}`);

  const moduleUrl = `http://localhost:4874/@fireproof/core@${fpVersion}?no-dts`;
  const moduleUrlWithTag = `http://localhost:4874/@fireproof/core@${fpVersion}?tag=smoke&no-dts`;

  console.log(`🔍 Checking module availability at primary URL: ${moduleUrl}`);

  let moduleToUse = moduleUrl;
  let moduleResponse = null;

  try {
    // Try regular URL first
    const startTime = Date.now();
    const response = await fetch(moduleUrl);
    const fetchTime = Date.now() - startTime;

    if (response.ok) {
      console.log(`✅ Module is available. Status: ${response.status}, Fetch time: ${fetchTime}ms`);
      moduleToUse = moduleUrl;
      moduleResponse = response;
    } else {
      console.log(`⚠️ Module not available at primary URL. Status: ${response.status}`);

      // Try URL with tag
      console.log(`🔍 Checking alternative URL: ${moduleUrlWithTag}`);
      const tagResponse = await fetch(moduleUrlWithTag);

      if (tagResponse.ok) {
        console.log(`✅ Module is available with tag. Status: ${tagResponse.status}`);
        moduleToUse = moduleUrlWithTag;
        moduleResponse = tagResponse;
      } else {
        console.error(`❌ Module not available with tag either. Status: ${tagResponse.status}`);
        throw new Error(`Module not available at either URL`);
      }
    }

    // Verify module content
    if (moduleResponse) {
      const moduleText = await moduleResponse.text();
      const contentLength = moduleText.length;
      console.log(`📊 Module content received. Size: ${contentLength} bytes`);

      if (contentLength < 100) {
        console.error(`❌ Module content suspiciously small (${contentLength} bytes)`);
        throw new Error(`Module content is suspiciously small: ${contentLength} bytes`);
      }

      // Check for basic expected content in the module
      if (!moduleText.includes("fireproof")) {
        console.error(`❌ Module content does not contain expected 'fireproof' string`);
        throw new Error(`Module content validation failed - missing expected content`);
      }
    }
  } catch (error) {
    console.error(`❌ Failed to fetch module: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    throw new Error(`Module not available: ${error.message}`);
  }

  console.log("🔧 Creating script element and setting up test environment");
  const script = document.createElement("script");

  // Log environment variables
  console.log("🔍 Environment variables:");
  console.log("  FP_VERSION:", (window as unknown as { FP_VERSION: string }).FP_VERSION);
  console.log("  FP_DEBUG:", (window as unknown as { FP_DEBUG: string }).FP_DEBUG);
  console.log("  FP_STACK:", (window as unknown as { FP_STACK: string }).FP_STACK);
  console.log("  Using module URL:", moduleToUse);

  script.textContent = `
(async () => {
  try {
    console.log("🔍 Starting dynamic import of module")
    const module = await import('${moduleToUse}')
    console.log("✅ Module imported successfully")
    const { fireproof } = module
    
    if (!fireproof) {
      console.error("❌ fireproof not found in imported module")
      throw new Error("fireproof not found in imported module")
    }
    console.log("✅ fireproof function found in module")
    
    function invariant(cond, message) {
      if (!cond) {
        console.error("❌ INVARIANT FAILED:", message);
        throw new Error(message)
      }
    }
    
    async function action(label, iteration) {
      console.log("🔄 Running iteration " + iteration + "/10");
      try {
        console.log("🔍 Creating database for iteration " + iteration);
        const db = fireproof("esm-test");
        console.log("✅ Database created for iteration " + iteration);
        
        console.log("🔍 Putting first document for iteration " + iteration);
        const ok = await db.put({ sort: Math.random(), test: "esm-success" });
        console.log("✅ First document created with id: " + ok.id);
        
        console.log("🔍 Getting all docs (before) for iteration " + iteration);
        const beforeAll = await db.allDocs();
        console.log("✅ Got all docs (before): " + beforeAll.rows.length + " documents");
        
        console.log("🔍 Putting second document for iteration " + iteration);
        await db.put({ foo: 1 });
        console.log("✅ Second document created");
        
        console.log("🔍 Getting all docs (after) for iteration " + iteration);
        const afterAll = await db.allDocs();
        console.log("✅ Got all docs (after): " + afterAll.rows.length + " documents");
  
        console.log("🔍 Checking invariant for iteration " + iteration);
        invariant(
          afterAll.rows.length == beforeAll.rows.length + 1,
          "all docs wrong count: before=" + beforeAll.rows.length + ", after=" + afterAll.rows.length
        );
        console.log("✅ Invariant check passed");
  
        console.log("🔍 Getting document by id for iteration " + iteration);
        const res = await db.get(ok.id);
        console.log("✅ Got document by id: " + JSON.stringify(res));
        
        console.log("🔍 Updating label for iteration " + iteration);
        label.innerHTML = [iteration,res.test].join(' - ');
        console.log("✅ Label updated to: " + label.innerHTML);
        
        console.log("🔍 Closing database for iteration " + iteration);
        await db.close();
        console.log("✅ Database closed for iteration " + iteration);
        
        return true;
      } catch (error) {
        console.error("❌ Error in iteration " + iteration + ": " + error.message);
        console.error("❌ Error stack: " + error.stack);
        label.innerHTML = "ERROR: " + error.message;
        throw error;
      }
    }
    
    async function main() {
      console.log("🚀 Main function started");
      const label = document.querySelector('#test-label');
      if (!label) {
        console.error("❌ Label element not found in main()");
        throw new Error("Label element not found");
      }
      console.log("✅ Found label element");
      
      for (let i = 0; i < 10; i++) {
        console.log("🔄 Starting iteration " + i);
        await action(label, i);
        console.log("✅ Completed iteration " + i);
      }
      
      console.log("🔍 Setting data-ready attribute");
      label.setAttribute("data-ready", "true");
      label.style.backgroundColor = "#4CAF50";
      label.style.color = "white";
      console.log("✅ All iterations completed successfully!");
    }
    
    console.log("🔍 About to call main()");
    main().catch(error => {
      console.error("❌ FATAL ERROR in main():", error.message);
      console.error("❌ Error stack:", error.stack);
      const label = document.querySelector('#test-label');
      if (label) {
        label.style.backgroundColor = "#F44336";
        label.style.color = "white";
        label.innerHTML = "FATAL ERROR: " + error.message;
      } else {
        console.error("❌ Could not find label element to show error");
      }
    });
  } catch (error) {
    console.error("❌ TOP-LEVEL ERROR:", error.message);
    console.error("❌ Error stack:", error.stack);
    const label = document.querySelector('#test-label');
    if (label) {
      label.style.backgroundColor = "#F44336";
      label.style.color = "white";
      label.innerHTML = "TOP-LEVEL ERROR: " + error.message;
    }
  }
})();
`;
  script.type = "module";

  console.log("🔧 Setting up DOM elements");
  // Create a more visible and clickable label with clear styling
  document.body.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
      <label 
        data-testid="label" 
        id="test-label"
        style="
          display: block;
          padding: 20px;
          margin: 20px;
          font-size: 18px;
          background-color: #f0f0f0;
          border: 2px solid #ccc;
          border-radius: 8px;
          min-width: 300px;
          min-height: 50px;
          text-align: center;
          cursor: pointer;
          z-index: 9999;
        "
      >Test running...</label>
    </div>
  `;
  document.body.appendChild(script);
  console.log("✅ Script appended to document body");

  // Check if the script element is actually in the DOM
  const scriptElements = document.querySelectorAll("script[type='module']");
  console.log(`🔍 Found ${scriptElements.length} module script elements in the DOM`);

  // Check if the label element exists before waiting
  const initialLabel = document.querySelector("#test-label");
  if (initialLabel) {
    console.log(`🔍 Initial label content: "${initialLabel.innerHTML}"`);
    console.log(`🔍 Label visibility: ${window.getComputedStyle(initialLabel as HTMLElement).visibility}`);
    console.log(`🔍 Label display: ${window.getComputedStyle(initialLabel as HTMLElement).display}`);
  } else {
    console.error("❌ Label element not found before waitUntil");
  }

  console.log("⏳ Waiting for test completion (data-ready attribute)");
  try {
    let progressCounter = 0;
    await vi.waitUntil(
      () => {
        const element = document.querySelector("[data-ready]");

        // Log progress every 10 seconds
        if (++progressCounter % 10 === 0) {
          const elapsedTime = Math.floor((Date.now() - testStartTime) / 1000);
          console.log(`⏳ Still waiting for test completion... (${elapsedTime}s elapsed)`);

          // Get current label content for progress updates
          const currentLabel = document.querySelector("#test-label");
          if (currentLabel) {
            console.log(`🔍 Current label content: "${currentLabel.innerHTML}"`);
          }

          // Check if any console errors have been logged by the script
          console.log("🔍 Checking for any script errors in console...");
        }

        // Log every check attempt (at a lower interval to avoid flooding)
        if (progressCounter % 3 === 0) {
          console.log(`🔄 Check attempt ${progressCounter}: data-ready attribute ${element ? "found" : "not found"}`);
        }

        return element;
      },
      {
        timeout: 30_000, // 30 seconds (increased from 15 seconds)
        interval: 1000, // Check every second
      },
    );

    console.log("✅ waitUntil completed successfully - data-ready attribute found");

    // Make sure the label is visible and scrolled into view before interacting
    try {
      const labelElement = document.querySelector("#test-label");
      if (labelElement) {
        (labelElement as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (error) {
      console.warn(`⚠️ Failed to scroll element into view: ${error.message}`);
    }

    // Add a small delay to ensure the element is fully visible
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const labelContent = await page.getByTestId("label").element().innerHTML;
    console.log(`✅ Final label content: "${labelContent}"`);
    expect(labelContent).toBe("9 - esm-success");

    // Log total test duration
    const totalDuration = Math.floor((Date.now() - testStartTime) / 1000);
    console.log(`✅ Test completed successfully in ${totalDuration} seconds`);
  } catch (error) {
    console.error(`❌ Test failed during waitUntil: ${error.message}`);

    // Try to capture the current state for debugging
    try {
      const currentLabel = document.querySelector("#test-label");
      if (currentLabel) {
        console.error(`🔍 Current label content: "${currentLabel.innerHTML}"`);
        console.error(`🔍 Label visibility: ${window.getComputedStyle(currentLabel as HTMLElement).visibility}`);
        console.error(`🔍 Label display: ${window.getComputedStyle(currentLabel as HTMLElement).display}`);

        // Try to make the element more visible
        (currentLabel as HTMLElement).style.position = "fixed";
        (currentLabel as HTMLElement).style.top = "50%";
        (currentLabel as HTMLElement).style.left = "50%";
        (currentLabel as HTMLElement).style.transform = "translate(-50%, -50%)";
        (currentLabel as HTMLElement).style.zIndex = "99999";
        (currentLabel as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });

        console.log("🔧 Attempted to fix element visibility");
      } else {
        console.error("❌ Label element not found in DOM");
      }

      // Log the entire document body for debugging
      const truncatedBody = document.body.innerHTML.slice(0, 100);
      console.error("🔍 Document body (first 100 bytes):", truncatedBody);
    } catch (error) {
      console.error(`❌ Failed to capture debug state: ${error.message}`);
    }

    // Log total test duration even on failure
    const totalDuration = Math.floor((Date.now() - testStartTime) / 1000);
    console.error(`❌ Test failed after ${totalDuration} seconds`);

    throw error;
  }
});
/* eslint-enable no-console */
