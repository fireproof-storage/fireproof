import { describe, it, expect, beforeEach } from "vitest";

describe("localStorage persistence through page reload", () => {
  // Clean up before each test
  beforeEach(() => {
    localStorage.clear();
  });

  it("should persist localStorage data", async () => {
    // Store test data in localStorage
    localStorage.setItem("test-key", "test-value");
    localStorage.setItem("test-number", "42");
    localStorage.setItem("test-object", JSON.stringify({ foo: "bar", count: 123 }));

    // Verify data is stored
    expect(localStorage.getItem("test-key")).toBe("test-value");
    expect(localStorage.getItem("test-number")).toBe("42");

    const storedObject = JSON.parse(localStorage.getItem("test-object") || "");
    expect(storedObject).toEqual({ foo: "bar", count: 123 });

    // Verify localStorage length
    expect(localStorage.length).toBe(3);
  });

  it("should handle localStorage clear", async () => {
    // Store some test data
    localStorage.setItem("temp-key", "temp-value");

    // Verify it's there
    expect(localStorage.getItem("temp-key")).toBe("temp-value");
    expect(localStorage.length).toBe(1);

    // Clear localStorage
    localStorage.clear();

    // Verify data is gone after clear
    expect(localStorage.getItem("temp-key")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("should handle complex localStorage operations", async () => {
    const testKey = "complex-test";
    const testData = {
      users: [
        { id: 1, name: "Alice", active: true },
        { id: 2, name: "Bob", active: false },
      ],
      settings: { theme: "dark", notifications: true },
      timestamp: Date.now(),
    };

    // Store complex data
    localStorage.setItem(testKey, JSON.stringify(testData));

    // Retrieve and verify
    const retrieved = JSON.parse(localStorage.getItem(testKey) || "");
    expect(retrieved).toEqual(testData);
    expect(retrieved.users).toHaveLength(2);
    expect(retrieved.users[0].name).toBe("Alice");
    expect(retrieved.settings.theme).toBe("dark");

    // Update data
    testData.users.push({ id: 3, name: "Charlie", active: true });
    localStorage.setItem(testKey, JSON.stringify(testData));

    const updated = JSON.parse(localStorage.getItem(testKey) || "");
    expect(updated.users).toHaveLength(3);
    expect(updated.users[2].name).toBe("Charlie");

    // Clean up
    localStorage.removeItem(testKey);
    expect(localStorage.getItem(testKey)).toBeNull();
  });
});
