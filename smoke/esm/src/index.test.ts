import { expect, it, vi, beforeAll } from "vitest";
import { browser } from "@vitest/browser";

// Set up environment variables before tests run
beforeAll(() => {
  // Make sure we're setting variables on the correct global object
  const gthis = globalThis || window || self || global;

  // Get FP_VERSION from the environment
  const fpVersion = process.env.FP_VERSION;
  if (fpVersion) {
    gthis.FP_VERSION = fpVersion;
    console.log(`✅ Set FP_VERSION to ${fpVersion} in beforeAll hook`);
  }

  // Set other environment variables if needed
  if (process.env.FP_DEBUG) gthis.FP_DEBUG = process.env.FP_DEBUG;
  if (process.env.FP_STACK) gthis.FP_STACK = process.env.FP_STACK;
});

/* eslint-disable no-console */
it("esm.sh", async () => {
  console.log("🚀 ESM TEST STARTING: Checking environment variables and module availability");

  // Set a start time to measure overall test duration
  const testStartTime = Date.now();

  // This test needs to run in a browser environment
  if (typeof window === "undefined") {
    console.log("⚠️ Test is running in Node.js environment, will continue in browser");
    return; // Skip the rest of the test in Node.js environment
  }

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
  let moduleContent = "";

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
      moduleContent = await moduleResponse.text();
      const contentLength = moduleContent.length;
      console.log(`📊 Module content received. Size: ${contentLength} bytes`);

      // Log the first 200 characters of the module content for debugging
      console.log(`📊 Module content (first 200 chars): ${moduleContent.substring(0, 200)}`);

      if (contentLength < 100) {
        console.error(`❌ Module content suspiciously small (${contentLength} bytes)`);
        throw new Error(`Module content is suspiciously small: ${contentLength} bytes`);
      }

      // Check for basic expected content in the module
      if (!moduleContent.includes("fireproof")) {
        console.error(`❌ Module content does not contain expected 'fireproof' string`);
        throw new Error(`Module content validation failed - missing expected content`);
      }
    }
  } catch (error) {
    console.error(`❌ Failed to fetch module: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    throw new Error(`Module not available: ${error.message}`);
  }

  // Modify the waitUntil function to fail fast if there's a module loading error
  const waitForDataReadyOrError = async () => {
    let progressCounter = 0;
    let moduleLoadError = false;

    try {
      await vi.waitUntil(
        () => {
          const element = document.querySelector("[data-ready]");
          const errorLabel = document.querySelector("#test-label");

          // Check if there's an error message in the label
          if (errorLabel && (errorLabel as HTMLElement).innerHTML.includes("MODULE LOAD ERROR")) {
            console.error("❌ Detected module load error in label, failing test immediately");
            moduleLoadError = true;
            return true; // Return true to exit the waitUntil
          }

          // Log progress periodically
          progressCounter++;
          if (progressCounter % 3 === 0) {
            console.log(`🔄 Check attempt ${progressCounter}: data-ready attribute not found`);
          }

          // Log more details every 10 seconds
          if (progressCounter % 10 === 0) {
            console.log(`⏳ Still waiting for test completion... (${Math.floor(progressCounter)}s elapsed)`);

            // Check the current label content for debugging
            if (errorLabel) {
              console.log(`🔍 Current label content: "${(errorLabel as HTMLElement).innerHTML}"`);
              console.log(`🔍 Checking for any script errors in console...`);
            }
          }

          return !!element;
        },
        {
          timeout: 30000,
          interval: 1000,
        },
      );

      if (moduleLoadError) {
        throw new Error("Test failed due to module loading error");
      }
    } catch (error) {
      console.error(`❌ Test failed during waitUntil: ${error.message}`);

      // Try to capture the current state for debugging
      try {
        const labelElement = document.querySelector("#test-label");
        if (labelElement) {
          console.log(`🔍 Current label content: "${(labelElement as HTMLElement).innerHTML}"`);
          console.log(`🔍 Label visibility: ${window.getComputedStyle(labelElement as HTMLElement).visibility}`);
          console.log(`🔍 Label display: ${window.getComputedStyle(labelElement as HTMLElement).display}`);
        }

        console.log(`🔍 Document body (first 100 bytes): \n${document.body.innerHTML.substring(0, 100)}`);
      } catch (debugError) {
        console.error(`❌ Error during debug capture: ${debugError.message}`);
      }

      throw error;
    }
  };

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
    let fireproof;
    try {
      // Verify that the module URL is accessible before attempting to import
      const checkResponse = await fetch('${moduleToUse}');
      if (!checkResponse.ok) {
        throw new Error("Module URL returned status " + checkResponse.status + " during pre-import check");
      }
      console.log("✅ Pre-import URL check successful: " + checkResponse.status);
      
      const module = await import('${moduleToUse}')
      console.log("✅ Module imported successfully")
      fireproof = module.fireproof
      
      if (!fireproof) {
        console.error("❌ fireproof not found in imported module")
        throw new Error("fireproof not found in imported module")
      }
      console.log("✅ fireproof function found in module")
    } catch (error) {
      console.error("❌ CRITICAL ERROR: Failed to import module:", error.message);
      console.error("❌ Error stack:", error.stack);
      
      // Update label with error and set a special attribute to signal test failure
      const label = document.querySelector('#test-label');
      if (label) {
        label.style.backgroundColor = "#F44336";
        label.style.color = "white";
        label.innerHTML = "MODULE LOAD ERROR: " + error.message;
        label.setAttribute("data-module-error", "true");
      }
      
      // Fail fast - don't proceed with test if module loading fails
      throw new Error("Module loading failed: " + error.message);
    }
    
    async function action(label, iteration, fireproofFn) {
      console.log("🔄 Running iteration " + iteration + "/10");
      try {
        console.log("🔍 Creating database for iteration " + iteration);
        const db = fireproofFn("esm-test");
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
        if (afterAll.rows.length !== beforeAll.rows.length + 1) {
          console.error("Error: all docs wrong count: before=" + beforeAll.rows.length + ", after=" + afterAll.rows.length);
          throw new Error("all docs wrong count: before=" + beforeAll.rows.length + ", after=" + afterAll.rows.length);
        }
        console.log("✅ Invariant check passed");
  
        console.log("🔍 Getting document by id for iteration " + iteration);
        const res = await db.get(ok.id);
        console.log("✅ Got document by id: " + JSON.stringify(res));
        
        console.log("🔍 Updating label for iteration " + iteration);
        label.innerHTML = iteration + " - " + res.test;
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
        await action(label, i, fireproof);
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

  console.log("🔧 Setting up DOM elements with absolute positioning");
  // Create a very simple DOM with minimal styling to avoid any potential interference
  document.body.innerHTML = `
    <div id="root" style="
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: white;
      z-index: 999999;
    ">
      <div id="container" style="
        position: relative;
        width: 80%;
        max-width: 500px;
        padding: 20px;
        background-color: white;
        border: 1px solid #ccc;
        z-index: 999999;
      ">
        <label 
          data-testid="label" 
          id="test-label"
          style="
            display: block;
            width: 100%;
            padding: 20px;
            margin: 0;
            font-size: 24px;
            font-family: Arial, sans-serif;
            background-color: #e0e0e0;
            border: 2px solid #999;
            border-radius: 8px;
            text-align: center;
            cursor: pointer;
            z-index: 999999;
            box-sizing: border-box;
          "
        >Test running...</label>
      </div>
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
    await waitForDataReadyOrError();
    console.log("✅ waitUntil completed successfully - data-ready attribute found");

    // Check for module error attribute before proceeding
    const errorElement = document.querySelector("[data-module-error]");
    if (errorElement) {
      console.error("❌ Module loading error detected, failing test immediately");
      throw new Error(`Module loading error detected: ${(errorElement as HTMLElement).innerHTML}`);
    }

    // Make sure the label is visible and scrolled into view before interacting
    try {
      console.log("🔧 Preparing element for interaction");

      // Force document to be at the top
      window.scrollTo(0, 0);

      const rootElement = document.querySelector("#root");
      if (rootElement) {
        console.log("✅ Root element found");
        // Ensure the root takes up the full viewport
        (rootElement as HTMLElement).style.width = "100vw";
        (rootElement as HTMLElement).style.height = "100vh";
      } else {
        console.error("❌ Root element not found");
      }

      const containerElement = document.querySelector("#container");
      if (containerElement) {
        console.log("✅ Container element found");
        // Center the container
        (containerElement as HTMLElement).style.position = "absolute";
        (containerElement as HTMLElement).style.top = "50%";
        (containerElement as HTMLElement).style.left = "50%";
        (containerElement as HTMLElement).style.transform = "translate(-50%, -50%)";
      } else {
        console.error("❌ Container element not found");
      }

      const labelElement = document.querySelector("#test-label");
      if (labelElement) {
        console.log("✅ Label element found");

        // Make the label extremely visible and positioned in a way that's easy to click
        (labelElement as HTMLElement).style.position = "relative";
        (labelElement as HTMLElement).style.width = "100%";
        (labelElement as HTMLElement).style.height = "auto";
        (labelElement as HTMLElement).style.padding = "30px";
        (labelElement as HTMLElement).style.margin = "0";
        (labelElement as HTMLElement).style.fontSize = "28px";
        (labelElement as HTMLElement).style.fontWeight = "bold";
        (labelElement as HTMLElement).style.backgroundColor = "#4CAF50";
        (labelElement as HTMLElement).style.color = "white";
        (labelElement as HTMLElement).style.border = "none";
        (labelElement as HTMLElement).style.borderRadius = "4px";
        (labelElement as HTMLElement).style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";

        // Log element details for debugging
        const rect = (labelElement as HTMLElement).getBoundingClientRect();
        console.log(`🔍 Label rect: top=${rect.top}, left=${rect.left}, width=${rect.width}, height=${rect.height}`);
        console.log(
          `🔍 Label computed style: display=${window.getComputedStyle(labelElement as HTMLElement).display}, visibility=${window.getComputedStyle(labelElement as HTMLElement).visibility}`,
        );
        console.log(`🔍 Label z-index: ${window.getComputedStyle(labelElement as HTMLElement).zIndex}`);

        // Try to ensure the element is in view
        (labelElement as HTMLElement).scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
      } else {
        console.error("❌ Label element not found");
      }

      // Log the entire DOM structure for debugging
      console.log("🔍 Current DOM structure:");
      console.log(document.documentElement.outerHTML.substring(0, 500) + "...");
    } catch (error) {
      console.error(`❌ Failed to prepare element for interaction: ${error.message}`);
    }

    // Add a much longer delay to ensure the element is fully visible and ready
    console.log("⏳ Waiting for 5 seconds before interaction...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log("✅ Wait complete, proceeding with interaction");

    // Get the label content and verify it
    const labelContent = await browser.page.getByTestId("label").element().innerHTML;
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
