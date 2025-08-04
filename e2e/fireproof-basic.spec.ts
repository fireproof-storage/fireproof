import { test, expect } from "@playwright/test";

test("Fireproof basic operations with reload", async ({ page }) => {
  // Navigate to the test page
  await page.goto("/e2e/fixtures/fireproof-basic.html");

  // Wait for page to load and check what's happening
  await page.waitForLoadState("networkidle");

  // Check browser console for errors - setup listeners first
  const consoleMessages: string[] = [];
  page.on("console", (msg) => {
    consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    console.log(`Browser console ${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log("Page error:", err.message);
  });

  // Wait for page to fully load and scripts to execute
  await page.waitForTimeout(3000);

  // Check if window functions are available
  const windowFunctions = await page.evaluate(() => {
    return {
      fpInit: typeof window.fpInit,
      fpPut: typeof window.fpPut,
      fpGet: typeof window.fpGet,
      fpAllDocs: typeof window.fpAllDocs,
    };
  });

  console.log("Window functions:", windowFunctions);
  console.log("All console messages:", consoleMessages);

  // Check for JavaScript errors
  const status = await page.locator("#status").textContent();
  console.log("Status content:", JSON.stringify(status));

  // If functions aren't available, the import probably failed
  if (windowFunctions.fpPut !== "function") {
    throw new Error(`window.fpPut is ${windowFunctions.fpPut}, not function. Console messages: ${consoleMessages.join(", ")}`);
  }

  // Put a test document
  const testDoc = {
    value: "test-data-value",
    timestamp: Date.now(),
    message: "This is a test document for E2E testing",
  };

  await page.evaluate(async (doc) => {
    await window.fpPut("test-doc", doc);
  }, testDoc);

  // Verify put operation succeeded
  await expect(page.locator("#status")).toContainText("Document put successfully: test-doc");

  // Get the document to verify it was stored
  const retrievedDoc = await page.evaluate(async () => {
    return await window.fpGet("test-doc");
  });

  expect(retrievedDoc._id).toBe("test-doc");
  expect(retrievedDoc.value).toBe(testDoc.value);
  expect(retrievedDoc.message).toBe(testDoc.message);

  // Get all documents to verify count
  const allDocs = await page.evaluate(async () => {
    return await window.fpAllDocs();
  });

  expect(allDocs.rows).toHaveLength(1);
  expect(allDocs.rows[0].key).toBe("test-doc");
  expect(allDocs.rows[0].value._id).toBe("test-doc");
  expect(allDocs.rows[0].value.value).toBe(testDoc.value);
  expect(allDocs.rows[0].value.message).toBe(testDoc.message);

  // Now reload the page to test persistence
  await page.reload();

  // Wait for page to load and auto-initialize after reload
  await expect(page.locator("#status")).toContainText("Database auto-initialized on page load");

  // Verify the document is still there after reload
  const docAfterReload = await page.evaluate(async () => {
    return await window.fpGet("test-doc");
  });

  expect(docAfterReload._id).toBe("test-doc");
  expect(docAfterReload.value).toBe(testDoc.value);
  expect(docAfterReload.message).toBe(testDoc.message);

  // Verify all documents still shows our document after reload
  const allDocsAfterReload = await page.evaluate(async () => {
    return await window.fpAllDocs();
  });

  expect(allDocsAfterReload.rows).toHaveLength(1);
  expect(allDocsAfterReload.rows[0].key).toBe("test-doc");
  expect(allDocsAfterReload.rows[0].value._id).toBe("test-doc");
  expect(allDocsAfterReload.rows[0].value.value).toBe(testDoc.value);
  expect(allDocsAfterReload.rows[0].value.message).toBe(testDoc.message);
});
