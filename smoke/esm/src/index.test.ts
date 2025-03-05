import { page } from "@vitest/browser/context";
import { expect, it, vi } from "vitest";

it("esm.sh", async () => {
  // Log browser information
  console.log("=== BROWSER ENVIRONMENT ===");
  console.log("User Agent:", navigator.userAgent);
  console.log("Platform:", navigator.platform);
  console.log("Language:", navigator.language);

  const script = document.createElement("script");
  const fpVersion = (window as unknown as { FP_VERSION: string }).FP_VERSION;
  // eslint-disable-next-line no-console
  console.log("FP_VERSION", fpVersion);
  // eslint-disable-next-line no-console
  console.log("FP_DEBUG", (window as unknown as { FP_DEBUG: string }).FP_DEBUG);
  // eslint-disable-next-line no-console
  console.log("FP_STACK", (window as unknown as { FP_STACK: string }).FP_STACK);

  // Define module URLs in one place
  const serverUrl = "http://localhost:4874";
  const moduleUrl = `${serverUrl}/@fireproof/core@${fpVersion}?no-dts`;
  const useFireproofUrl = `${serverUrl}/use-fireproof@${fpVersion}?no-dts`;

  // Check server connectivity
  try {
    // eslint-disable-next-line no-console
    console.log("Server ping:", await fetch(serverUrl).then((r) => r.status));
    // eslint-disable-next-line no-console
    console.log(
      "Package ping:",
      await fetch(moduleUrl).then(
        (r) => ({ status: r.status, ok: r.ok, statusText: r.statusText }),
      ),
    );
    // eslint-disable-next-line no-console
    console.log(
      "use-fireproof ping:",
      await fetch(useFireproofUrl).then(
        (r) => ({ status: r.status, ok: r.ok, statusText: r.statusText }),
      ),
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log("Server error:", e);
  }

  // Add a simple inline script to test basic script execution
  const testScript = document.createElement("script");
  testScript.textContent = "console.log('Basic script execution test');";
  document.body.appendChild(testScript);

  // eslint-disable-next-line no-console
  console.log("adding script");

  // Add error event listeners to the window
  window.addEventListener("error", (event) => {
    console.error("Global error caught:", event.message, event.filename, event.lineno);
  });

  // Create a more robust script with error handling
  script.textContent = `
try {
  console.log("start script");
  
  // Test basic module functionality first
  console.log("Testing basic module import");
  
  // Test package URL with fetch before trying to import
  console.log("Testing package URL with fetch before import");
  fetch("${moduleUrl}")
    .then(response => {
      console.log("Pre-import fetch result:", {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        url: response.url
      });
      if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}, statusText: \${response.statusText}\`);
      }
      return response.text();
    })
    .then(text => {
      console.log("Module content first 100 chars:", text.substring(0, 100));
    })
    .catch(error => {
      console.error("Pre-import fetch error:", error.message, error.stack);
    });
  
  // Then try the actual import
  import("${moduleUrl}")
    .then(module => {
      console.log("window-js", window.FP_VERSION);
      console.log("Fireproof module type:", typeof module.fireproof);
      
      function invariant(cond, message) {
        if (!cond) {
          throw new Error(message);
        }
      }
      
      async function action(label, run) {
        console.log("Starting action run:", run);
        const db = module.fireproof("esm-test");
        console.log("DB created for run:", run);
        const ok = await db.put({ sort: Math.random(), test: "esm-success" });
        console.log("First doc put result:", ok.id);
      
        const beforeAll = await db.allDocs();
        console.log("beforeAll count:", beforeAll.rows.length);
        await db.put({ foo: 1 });
        const afterAll = await db.allDocs();
        console.log("afterAll count:", afterAll.rows.length);
      
        invariant(
          afterAll.rows.length == beforeAll.rows.length + 1,
          "all docs wrong count"
        );
      
        const res = await db.get(ok.id);
        console.log("Get result:", res.test);
        label.innerHTML = [run,res.test].join(' - ');
        await db.close();
        console.log("Completed action run:", run);
      }
      
      async function main() {
        console.log("Starting main function");
        const label = document.querySelector('label');
        for (let i = 0; i < 10; i++) {
          await action(label, i);
        }
        label.setAttribute("data-ready", "");
        console.log("Main function complete");
      }
      
      main().catch(e => {
        console.error("Main function error:", e);
      });
    })
    .catch(error => {
      console.error("Module import error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause ? { name: error.cause.name, message: error.cause.message } : undefined
      });
    });
} catch (error) {
  console.error("Script execution error:", error);
}
`;

  script.type = "module";
  document.body.innerHTML = `<label data-testid="label" id="label"></label>`;

  // Add error handling for script loading
  script.onerror = (event) => {
    // eslint-disable-next-line no-console
    console.error("Script load error:", event);
  };

  document.body.appendChild(script);
  // eslint-disable-next-line no-console
  console.log("script added");

  // Add a small delay to ensure the script has a chance to start
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // eslint-disable-next-line no-console
  console.log("after script delay");

  try {
    // eslint-disable-next-line no-console
    console.log("Waiting for data-ready attribute...");
    await vi.waitUntil(
      () => {
        const ready = !!document.querySelector("[data-ready]");
        // eslint-disable-next-line no-console
        console.log("Check for data-ready:", ready);
        return ready;
      },
      { timeout: 30_000 },
    );

    const labelContent = await page.getByTestId("label").element().innerHTML;
    // eslint-disable-next-line no-console
    console.log("Final label content:", labelContent);
    expect(labelContent).toBe("9 - esm-success");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Test timeout or error:", error);
    // eslint-disable-next-line no-console
    console.log("Current document body:", document.body.innerHTML);
    throw error;
  }
});
