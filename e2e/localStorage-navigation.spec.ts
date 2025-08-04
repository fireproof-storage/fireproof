import { test, expect } from "@playwright/test";

test.describe("localStorage persistence across real page navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh by clearing localStorage
    await page.goto("/page1.html");
    await page.evaluate(() => localStorage.clear());
  });

  test("should persist localStorage data when navigating between pages", async ({ page }) => {
    // Start on page 1
    await page.goto("/page1.html");

    // Set test data
    const testData = {
      message: "Navigation test data",
      timestamp: Date.now(),
      origin: "page1",
    };

    await page.evaluate((data) => {
      window.setTestData("navigation-test", data);
    }, testData);

    // Verify data is set on page 1
    const dataOnPage1 = await page.evaluate(() => window.getTestData("navigation-test"));
    expect(dataOnPage1).toEqual(testData);

    // Navigate to page 2 using link click (real navigation)
    await page.click("#navToPage2");
    await page.waitForLoadState("domcontentloaded");

    // Verify data persisted after navigation
    const dataOnPage2 = await page.evaluate(() => window.getTestData("navigation-test"));
    expect(dataOnPage2).toEqual(testData);
    expect(dataOnPage2.message).toBe("Navigation test data");

    // Navigate to page 3
    await page.click("#navToPage3");
    await page.waitForLoadState("domcontentloaded");

    // Verify data still persists
    const dataOnPage3 = await page.evaluate(() => window.getTestData("navigation-test"));
    expect(dataOnPage3).toEqual(testData);
  });

  test("should allow data updates across page navigation", async ({ page }) => {
    // Start on page 1
    await page.goto("/page1.html");

    // Set initial data
    const initialData = { counter: 1, source: "page1" };
    await page.evaluate((data) => {
      window.setTestData("update-test", data);
    }, initialData);

    // Navigate to page 2
    await page.goto("/page2.html");

    // Update data on page 2
    await page.evaluate(() => {
      const existing = window.getTestData("update-test");
      const updated = { ...existing, counter: existing.counter + 1, source: "page2" };
      window.setTestData("update-test", updated);
    });

    // Verify updated data
    const updatedData = await page.evaluate(() => window.getTestData("update-test"));
    expect(updatedData.counter).toBe(2);
    expect(updatedData.source).toBe("page2");

    // Navigate back to page 1
    await page.goto("/page1.html");

    // Verify updated data is still there
    const finalData = await page.evaluate(() => window.getTestData("update-test"));
    expect(finalData.counter).toBe(2);
    expect(finalData.source).toBe("page2");
  });

  test("should handle complex navigation flows with data accumulation", async ({ page }) => {
    // Page 1: Set initial data
    await page.goto("/page1.html");
    await page.click("#setData"); // This uses the page's built-in functionality

    let currentData = await page.evaluate(() => window.getTestData("navigation-test"));
    expect(currentData.page).toBe("page1");

    // Navigate to page 2 and update
    await page.goto("/page2.html");
    await page.click("#updateData"); // Uses page 2's built-in functionality

    currentData = await page.evaluate(() => window.getTestData("navigation-test"));
    expect(currentData.page).toBe("page2");
    expect(currentData.updateCount).toBe(1);

    // Add user data
    await page.click("#addUser");
    currentData = await page.evaluate(() => window.getTestData("navigation-test"));
    expect(currentData.users).toHaveLength(1);
    expect(currentData.users[0].createdOn).toBe("page2");

    // Navigate to page 3 and verify all data is still there
    await page.goto("/page3.html");
    const finalData = await page.evaluate(() => window.getTestData("navigation-test"));
    expect(finalData.page).toBe("page2"); // Last updated on page 2
    expect(finalData.users).toHaveLength(1);
    expect(finalData.updateCount).toBe(1);
  });

  test("should maintain data integrity through navigation and reload cycle", async ({ page }) => {
    // Set data on page 1
    await page.goto("/page1.html");
    const testData = {
      value: "persistent through nav+reload",
      lifecycle: ["created"],
      timestamp: Date.now(),
    };

    await page.evaluate((data) => {
      window.setTestData("lifecycle-test", data);
    }, testData);

    // Navigate to page 2
    await page.goto("/page2.html");
    await page.evaluate(() => {
      const existing = window.getTestData("lifecycle-test");
      existing.lifecycle.push("navigated-to-page2");
      window.setTestData("lifecycle-test", existing);
    });

    // Reload page 2
    await page.reload();

    // Verify data survived reload
    const currentData = await page.evaluate(() => window.getTestData("lifecycle-test"));
    expect(currentData.lifecycle).toContain("navigated-to-page2");

    // Navigate back to page 1
    await page.goto("/page1.html");

    // Add final lifecycle event
    await page.evaluate(() => {
      const existing = window.getTestData("lifecycle-test");
      existing.lifecycle.push("returned-to-page1");
      window.setTestData("lifecycle-test", existing);
    });

    // Final verification
    const finalData = await page.evaluate(() => window.getTestData("lifecycle-test"));
    expect(finalData.value).toBe("persistent through nav+reload");
    expect(finalData.lifecycle).toEqual(["created", "navigated-to-page2", "returned-to-page1"]);
  });

  test("should handle programmatic navigation with localStorage", async ({ page }) => {
    // Start on page 1
    await page.goto("/page1.html");

    // Set data
    await page.evaluate(() => {
      window.setTestData("programmatic-test", { method: "direct-navigation" });
    });

    // Use programmatic navigation (page.goto instead of clicking links)
    await page.goto("/page2.html");

    // Verify data persisted
    const data = await page.evaluate(() => window.getTestData("programmatic-test"));
    expect(data.method).toBe("direct-navigation");

    // Use browser back/forward
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Should be back on page 1, data should still be there
    expect(page.url()).toContain("page1.html");
    const backData = await page.evaluate(() => window.getTestData("programmatic-test"));
    expect(backData.method).toBe("direct-navigation");

    // Forward again
    await page.goForward();
    await page.waitForLoadState("domcontentloaded");

    // Should be on page 2, data should persist
    expect(page.url()).toContain("page2.html");
    const forwardData = await page.evaluate(() => window.getTestData("programmatic-test"));
    expect(forwardData.method).toBe("direct-navigation");
  });
});
