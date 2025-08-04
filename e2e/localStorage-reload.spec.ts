import { test, expect } from '@playwright/test';

test.describe('localStorage persistence with real page reload', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh by clearing localStorage
    await page.goto('/page1.html');
    await page.evaluate(() => localStorage.clear());
  });

  test('should persist localStorage data through page.reload()', async ({ page }) => {
    // Navigate to test page
    await page.goto('/page1.html');
    
    // Set test data using page's exposed function
    const testData = {
      message: 'This should survive page reload',
      timestamp: Date.now(),
      page: 'page1'
    };
    
    await page.evaluate((data) => {
      window.setTestData('reload-test', data);
    }, testData);
    
    // Verify data is initially stored
    const initialData = await page.evaluate(() => window.getTestData('reload-test'));
    expect(initialData).toEqual(testData);
    
    // Perform actual page reload
    await page.reload();
    
    // Verify data persisted after reload
    const reloadedData = await page.evaluate(() => window.getTestData('reload-test'));
    expect(reloadedData).toEqual(testData);
    expect(reloadedData.message).toBe('This should survive page reload');
  });

  test('should persist complex data structures through reload', async ({ page }) => {
    await page.goto('/page2.html');
    
    const complexData = {
      users: [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false }
      ],
      settings: {
        theme: 'dark',
        notifications: true,
        language: 'en'
      },
      metadata: {
        version: '1.0.0',
        created: new Date().toISOString(),
        features: ['localStorage', 'navigation', 'reload']
      }
    };
    
    // Store complex data
    await page.evaluate((data) => {
      window.setTestData('complex-data', data);
    }, complexData);
    
    // Reload the page
    await page.reload();
    
    // Verify complex data structure survived reload
    const retrievedData = await page.evaluate(() => window.getTestData('complex-data'));
    expect(retrievedData).toEqual(complexData);
    expect(retrievedData.users).toHaveLength(2);
    expect(retrievedData.users[0].name).toBe('Alice');
    expect(retrievedData.settings.theme).toBe('dark');
    expect(retrievedData.metadata.features).toContain('localStorage');
  });

  test('should handle multiple reloads with data integrity', async ({ page }) => {
    await page.goto('/page3.html');
    
    // Set initial data
    let testData = { counter: 1, reloaded: false };
    await page.evaluate((data) => {
      window.setTestData('multi-reload', data);
    }, testData);
    
    // First reload
    await page.reload();
    testData = { ...testData, counter: 2, reloaded: true };
    await page.evaluate((data) => {
      const existing = window.getTestData('multi-reload');
      window.setTestData('multi-reload', { ...existing, ...data });
    }, { counter: 2, reloaded: true });
    
    // Second reload
    await page.reload();
    const finalData = await page.evaluate(() => window.getTestData('multi-reload'));
    expect(finalData.counter).toBe(2);
    expect(finalData.reloaded).toBe(true);
  });

  test('should maintain localStorage across different pages after reload', async ({ page }) => {
    // Set data on page 1
    await page.goto('/page1.html');
    const sharedData = { 
      sharedValue: 'persistent across pages and reloads',
      setFrom: 'page1'
    };
    await page.evaluate((data) => {
      window.setTestData('shared-data', data);
    }, sharedData);
    
    // Reload page 1
    await page.reload();
    const dataAfterReload = await page.evaluate(() => window.getTestData('shared-data'));
    expect(dataAfterReload).toEqual(sharedData);
    
    // Navigate to page 2
    await page.goto('/page2.html');
    const dataOnPage2 = await page.evaluate(() => window.getTestData('shared-data'));
    expect(dataOnPage2).toEqual(sharedData);
    
    // Reload page 2
    await page.reload();
    const dataAfterPage2Reload = await page.evaluate(() => window.getTestData('shared-data'));
    expect(dataAfterPage2Reload).toEqual(sharedData);
  });
});