import { expect, test, vi } from "vitest";

test("esm.sh", async () => {
  // Create a visible label to ensure it can be interacted with
  const label = document.createElement("div");
  label.id = "test-result";
  label.textContent = "Running Fireproof ESM Test...";
  label.style.position = "fixed";
  label.style.top = "10px";
  label.style.left = "10px";
  label.style.zIndex = "10000";
  label.style.backgroundColor = "white";
  label.style.padding = "10px";
  label.style.border = "1px solid black";
  label.style.fontFamily = "monospace";
  document.body.appendChild(label);

  // Wait a moment for the DOM to stabilize
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const script = document.createElement("script");
  // eslint-disable-next-line no-console
  console.log("FP_VERSION", (window as unknown as { FP_VERSION: string }).FP_VERSION);
  // eslint-disable-next-line no-console
  console.log("FP_DEBUG", (window as unknown as { FP_DEBUG: string }).FP_DEBUG);
  // eslint-disable-next-line no-console
  console.log("FP_STACK", (window as unknown as { FP_STACK: string }).FP_STACK);
  // eslint-disable-next-line no-console
  console.log("Running ESM test");
  script.textContent = `
    // Create a function to update the test status
    function updateTestStatus(status, message) {
      const label = document.getElementById('test-result');
      if (label) {
        label.textContent = status + ': ' + message;
        label.setAttribute('data-status', status);
      }
    }

    // Invariant function from the old test
    function invariant(cond, message) {
      if (!cond) {
        throw new Error(message);
      }
    }

    // Set initial status
    updateTestStatus('RUNNING', 'Importing Fireproof...');

    // Handle errors globally
    window.addEventListener('error', function(event) {
      console.error('Global error:', event.error);
      updateTestStatus('ERROR', 'Global error: ' + event.error.message);
    });

    // Run the test in an async IIFE
    (async function runTest() {
      try {
        updateTestStatus('RUNNING', 'Importing Fireproof module...');
        const { fireproof } = await import('http://localhost:4874/@fireproof/core@${window.FP_VERSION}?no-dts');
        console.log('window-js', window.FP_VERSION);
        
        // Debug the module structure
        console.log('Module structure:', Object.keys(fireproof));
        
        updateTestStatus('RUNNING', 'Creating database...');
        // Use the fireproof export which contains the Fireproof constructor
        const db = fireproof('esm-test');
        
        updateTestStatus('RUNNING', 'Adding document...');
        const doc = await db.put({
          hello: 'world', 
          test: 'esm-success',
          timestamp: Date.now()
        });
        
        // Check document counts (from old test)
        updateTestStatus('RUNNING', 'Checking document counts...');
        const beforeAll = await db.allDocs();
        await db.put({ foo: 1 });
        const afterAll = await db.allDocs();
        
        // Verify document count (from old test)
        invariant(
          afterAll.rows.length === beforeAll.rows.length + 1,
          "all docs wrong count"
        );
        
        updateTestStatus('RUNNING', 'Retrieving document...');
        const result = await db.get(doc.id);
        
        // Close the database (from old test)
        updateTestStatus('RUNNING', 'Closing database...');
        await db.close();
        
        if (result.hello === 'world' && result.test === 'esm-success') {
          updateTestStatus('SUCCESS', JSON.stringify(result));
        } else {
          updateTestStatus('ERROR', 'Unexpected result: ' + JSON.stringify(result));
        }
      } catch (e) {
        console.log('FP_DEBUG', e);
        console.log('FP_STACK', e.stack);
        updateTestStatus('ERROR', e.message);
      }
    })();
  `;
  script.type = "module";
  document.body.appendChild(script);

  // Wait for 5 seconds before checking for results to allow the script to initialize
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Poll for test completion instead of waiting for a specific element
  const maxWaitTime = 600000; // 10 minutes
  const startTime = Date.now();

  let status = null;
  while (Date.now() - startTime < maxWaitTime) {
    const resultElement = document.getElementById("test-result");
    if (resultElement && resultElement.hasAttribute("data-status")) {
      status = resultElement.getAttribute("data-status");
      if (status === "SUCCESS" || status === "ERROR") {
        break;
      }
    }
    // Wait a short time before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Get the final result
  const resultElement = document.getElementById("test-result");
  const content = resultElement ? resultElement.textContent : "No result found";
  console.log(content);

  // Check if there was an error
  if (!resultElement || !status) {
    throw new Error(`Test timed out or failed to complete: ${content}`);
  } else if (status === "ERROR") {
    throw new Error(`Test failed with error: ${content}`);
  }

  // Check for success
  expect(status).toBe("SUCCESS");
});
