import { describe, it, expect, beforeEach } from "vitest";

describe("localStorage with simple navigation", () => {
  beforeEach(() => {
    // Clean up localStorage before each test
    localStorage.clear();
  });

  it("should persist localStorage data through navigation", async () => {
    // Set some test data
    const testData = {
      user: "alice",
      preferences: { theme: "dark" },
      timestamp: Date.now()
    };
    
    localStorage.setItem("nav-test", JSON.stringify(testData));
    
    // Verify data is initially stored
    expect(localStorage.getItem("nav-test")).toBe(JSON.stringify(testData));
    
    // Simulate navigation by changing the URL hash (which doesn't reload the page)
    window.location.hash = "#page1";
    
    // Data should still be there after hash change
    const afterHashChange = localStorage.getItem("nav-test");
    expect(afterHashChange).toBe(JSON.stringify(testData));
    
    // Change hash again
    window.location.hash = "#page2";
    
    // Data should still persist
    const afterSecondHashChange = localStorage.getItem("nav-test");
    expect(JSON.parse(afterSecondHashChange || "{}")).toEqual(testData);
  });

  it("should handle pushState navigation", () => {
    // Set test data
    localStorage.setItem("pushstate-test", "test-value");
    
    // Use pushState to simulate navigation (doesn't reload page)
    const originalPath = window.location.pathname;
    window.history.pushState({}, "", "/test-page");
    
    // Data should persist after pushState
    expect(localStorage.getItem("pushstate-test")).toBe("test-value");
    
    // Navigate "back"
    window.history.pushState({}, "", originalPath);
    
    // Data should still be there
    expect(localStorage.getItem("pushstate-test")).toBe("test-value");
  });

  it("should prove localStorage works in browser environment", () => {
    // Simple proof that we're in a real browser environment
    expect(typeof localStorage).toBe("object");
    expect(typeof window).toBe("object");
    expect(typeof document).toBe("object");
    
    // Test localStorage functionality
    localStorage.setItem("browser-test", "working");
    expect(localStorage.getItem("browser-test")).toBe("working");
    expect(localStorage.length).toBe(1);
    
    // Test complex data
    const complexData = { 
      array: [1, 2, 3], 
      nested: { prop: "value" },
      boolean: true,
      null_value: null
    };
    
    localStorage.setItem("complex", JSON.stringify(complexData));
    const retrieved = JSON.parse(localStorage.getItem("complex") || "{}");
    expect(retrieved).toEqual(complexData);
  });
});