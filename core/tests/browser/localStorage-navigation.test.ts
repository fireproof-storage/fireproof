import { describe, it, expect, beforeEach } from "vitest";

describe("localStorage persistence across page navigation", () => {
  const testKeyPrefix = "nav-test-" + Date.now() + "-";
  let testKeys: string[] = [];
  
  beforeEach(() => {
    // Clean up any existing test data
    testKeys.forEach(key => {
      localStorage.removeItem(key);
    });
    testKeys = [];
  });
  
  // Helper function to create test-specific keys
  const createTestKey = (suffix: string) => {
    const key = testKeyPrefix + suffix;
    testKeys.push(key);
    return key;
  };

  it("should persist localStorage data when navigating between pages", async () => {
    // Set test data using our isolated key
    const testKey = createTestKey("navigation");
    const testData = {
      message: "Navigation test data",
      timestamp: Date.now(),
      page: "initial"
    };
    
    localStorage.setItem(testKey, JSON.stringify(testData));
    
    // Verify data is set initially
    expect(localStorage.getItem(testKey)).toBe(JSON.stringify(testData));
    
    // Navigate to fixture page and back using window.location
    await new Promise<void>((resolve) => {
      const originalHref = window.location.href;
      const handleLoad = () => {
        window.removeEventListener('load', handleLoad);
        
        // Verify data persisted after navigation
        const persistedData = localStorage.getItem(testKey);
        expect(persistedData).toBe(JSON.stringify(testData));
        
        // Navigate back to original location
        const handleSecondLoad = () => {
          window.removeEventListener('load', handleSecondLoad);
          
          // Final verification that data still persists
          const finalData = localStorage.getItem(testKey);
          expect(finalData).toBe(JSON.stringify(testData));
          resolve();
        };
        window.addEventListener('load', handleSecondLoad);
        window.location.href = originalHref;
      };
      
      window.addEventListener('load', handleLoad);
      window.location.href = './fixtures/page1.html';
    });
  });

  it("should demonstrate localStorage works in browser environment", () => {
    // Simple test to verify localStorage is available and functional
    const testKey = createTestKey("simple");
    const testValue = "simple test value";
    
    localStorage.setItem(testKey, testValue);
    expect(localStorage.getItem(testKey)).toBe(testValue);
    
    // Test JSON data
    const jsonData = { test: true, number: 42 };
    localStorage.setItem(testKey + "-json", JSON.stringify(jsonData));
    const retrieved = JSON.parse(localStorage.getItem(testKey + "-json") || "{}");
    expect(retrieved).toEqual(jsonData);
  });
});