import { expect, test } from "vitest";

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
        // Using console.log for diagnostics is intentional in test code
        // eslint-disable-next-line no-console
        console.log('Status updated:', status, message);
      }
    }

    // Invariant function from the old test
    function invariant(cond, message) {
      if (!cond) {
        throw new Error(message);
      }
    }

    // Helper function to log diagnostic information
    async function logDiagnostics(message, data = {}) {
      const diagnosticInfo = {
        timestamp: new Date().toISOString(),
        message,
        ...data
      };
      // Using console.log for diagnostics is intentional in test code
      // eslint-disable-next-line no-console
      console.log('DIAGNOSTIC:', JSON.stringify(diagnosticInfo));
    }

    // Helper to check network connectivity
    async function checkConnectivity(url) {
      try {
        const startTime = performance.now();
        const response = await fetch(url, { method: 'HEAD' });
        const endTime = performance.now();
        const latency = endTime - startTime;
        
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          latency: latency.toFixed(2) + 'ms',
          headers: Object.fromEntries([...response.headers.entries()])
        };
      } catch (error) {
        return {
          ok: false,
          error: error.message,
          stack: error.stack
        };
      }
    }

    // Set initial status
    updateTestStatus('RUNNING', 'Starting ESM test diagnostics...');

    // Handle errors globally
    window.addEventListener('error', function(event) {
      // eslint-disable-next-line no-console
      console.error('Global error:', event.error);
      logDiagnostics('Global error occurred', { 
        error: event.error.message,
        stack: event.error.stack
      });
      updateTestStatus('ERROR', 'Global error: ' + event.error.message);
    });

    // Run the test in an async IIFE
    (async function runTest() {
      try {
        // Log environment info
        await logDiagnostics('Environment info', {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          windowSize: {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight
          },
          fpVersion: window.FP_VERSION
        });

        // First check registry connectivity
        const registryUrl = 'http://localhost:4873/';
        await logDiagnostics('Checking registry connectivity', { url: registryUrl });
        const registryConnectivity = await checkConnectivity(registryUrl);
        await logDiagnostics('Registry connectivity result', registryConnectivity);
        
        // Check ESM server connectivity
        const esmServerUrl = 'http://localhost:4874/';
        await logDiagnostics('Checking ESM server connectivity', { url: esmServerUrl });
        const esmConnectivity = await checkConnectivity(esmServerUrl);
        await logDiagnostics('ESM server connectivity result', esmConnectivity);
        
        // First check if the module is available by doing a fetch
        const moduleUrl = 'http://localhost:4874/@fireproof/core@${window.FP_VERSION}?no-dts';
        updateTestStatus('RUNNING', 'Checking if module is available: ' + moduleUrl);
        await logDiagnostics('Checking module availability', { url: moduleUrl });
        
        // Try to fetch the module first to fail fast if it's not available
        const moduleCheck = await checkConnectivity(moduleUrl);
        await logDiagnostics('Module availability result', moduleCheck);
        
        if (!moduleCheck.ok) {
          // Try to get more information about what's in the registry
          try {
            const packageScope = 'http://localhost:4874/@fireproof/';
            const scopeCheck = await fetch(packageScope);
            const scopeText = await scopeCheck.text();
            await logDiagnostics('Package scope content', { 
              url: packageScope,
              status: scopeCheck.status,
              content: scopeText.substring(0, 1000) // Limit the size
            });
          } catch (e) {
            await logDiagnostics('Failed to check package scope', { error: e.message });
          }
          
          throw new Error('Module not available: HTTP status ' + moduleCheck.status + 
            (moduleCheck.statusText ? ' - ' + moduleCheck.statusText : ''));
        }
        
        updateTestStatus('RUNNING', 'Module available, importing Fireproof...');
        await logDiagnostics('Starting module import');
        const importStartTime = performance.now();
        
        try {
          const { fireproof } = await import(moduleUrl);
          const importEndTime = performance.now();
          await logDiagnostics('Module import successful', { 
            duration: (importEndTime - importStartTime).toFixed(2) + 'ms',
            moduleKeys: Object.keys(fireproof || {})
          });
          
          // eslint-disable-next-line no-console
          console.log('window-js', window.FP_VERSION);
          
          // Debug the module structure
          // eslint-disable-next-line no-console
          console.log('Module structure:', Object.keys(fireproof));
          
          updateTestStatus('RUNNING', 'Creating database...');
          // Use the fireproof export which contains the Fireproof constructor
          const db = fireproof('esm-test');
          await logDiagnostics('Database created');
          
          updateTestStatus('RUNNING', 'Adding document...');
          const doc = await db.put({
            hello: 'world', 
            test: 'esm-success',
            timestamp: Date.now()
          });
          await logDiagnostics('Document added', { docId: doc.id });
          
          // Check document counts (from old test)
          updateTestStatus('RUNNING', 'Checking document counts...');
          const beforeAll = await db.allDocs();
          await logDiagnostics('Before document count', { count: beforeAll.rows.length });
          
          await db.put({ foo: 1 });
          const afterAll = await db.allDocs();
          await logDiagnostics('After document count', { count: afterAll.rows.length });
          
          // Verify document count (from old test)
          invariant(
            afterAll.rows.length === beforeAll.rows.length + 1,
            "all docs wrong count"
          );
          
          updateTestStatus('RUNNING', 'Retrieving document...');
          const result = await db.get(doc.id);
          await logDiagnostics('Document retrieved', { doc: result });
          
          // Close the database (from old test)
          updateTestStatus('RUNNING', 'Closing database...');
          await db.close();
          await logDiagnostics('Database closed');
          
          if (result.hello === 'world' && result.test === 'esm-success') {
            updateTestStatus('SUCCESS', JSON.stringify(result));
            await logDiagnostics('Test completed successfully');
          } else {
            updateTestStatus('ERROR', 'Unexpected result: ' + JSON.stringify(result));
            await logDiagnostics('Test failed - unexpected result', { expected: { hello: 'world', test: 'esm-success' }, actual: result });
          }
        } catch (importError) {
          await logDiagnostics('Module import failed', { 
            error: importError.message,
            stack: importError.stack,
            duration: (performance.now() - importStartTime).toFixed(2) + 'ms'
          });
          throw importError;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('FP_DEBUG', e);
        // eslint-disable-next-line no-console
        console.log('FP_STACK', e.stack);
        await logDiagnostics('Test failed with error', { 
          error: e.message,
          stack: e.stack
        });
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
  // eslint-disable-next-line no-console
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
