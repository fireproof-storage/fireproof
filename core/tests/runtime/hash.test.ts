import { describe, expect, it } from "vitest";
import { hashStringSync, hashObjectSync } from "../../runtime/utils.js";

describe("Hash functions", () => {
  describe("hashStringSync", () => {
    it("should hash a simple string", () => {
      const result = hashStringSync("hello");
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should produce consistent hashes for the same input", () => {
      const input = "test string";
      const hash1 = hashStringSync(input);
      const hash2 = hashStringSync(input);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = hashStringSync("hello");
      const hash2 = hashStringSync("world");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty string", () => {
      const result = hashStringSync("");
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle unicode characters", () => {
      const result = hashStringSync("=%>�");
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle long strings", () => {
      const longString = "a".repeat(10000);
      const result = hashStringSync(longString);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should produce different hashes for strings with different whitespace", () => {
      const hash1 = hashStringSync("hello world");
      const hash2 = hashStringSync("hello  world");
      const hash3 = hashStringSync("hello\tworld");
      const hash4 = hashStringSync("hello\nworld");

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).not.toBe(hash4);
      expect(hash2).not.toBe(hash3);
      expect(hash2).not.toBe(hash4);
      expect(hash3).not.toBe(hash4);
    });

    it("should be case sensitive", () => {
      const hash1 = hashStringSync("Hello");
      const hash2 = hashStringSync("hello");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle special characters and symbols", () => {
      const specialChars = "!@#$%^&*()_+-=[]{}|;:,.<>?";
      const result = hashStringSync(specialChars);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("hashObjectSync", () => {
    it("should hash a simple object", () => {
      const obj = { name: "test", value: 42 };
      const result = hashObjectSync(obj);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should produce consistent hashes for the same object", () => {
      const obj = { name: "test", value: 42 };
      const hash1 = hashObjectSync(obj);
      const hash2 = hashObjectSync(obj);
      expect(hash1).toBe(hash2);
    });

    it("should produce same hash for objects with same properties in different order", () => {
      const obj1 = { name: "test", value: 42 };
      const obj2 = { value: 42, name: "test" };
      const hash1 = hashObjectSync(obj1);
      const hash2 = hashObjectSync(obj2);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for objects with different values", () => {
      const obj1 = { name: "test", value: 42 };
      const obj2 = { name: "test", value: 43 };
      const hash1 = hashObjectSync(obj1);
      const hash2 = hashObjectSync(obj2);
      expect(hash1).not.toBe(hash2);
    });

    it("should handle nested objects", () => {
      const obj = {
        user: {
          name: "John",
          details: {
            age: 30,
            address: {
              city: "New York",
              zip: "10001",
            },
          },
        },
      };
      const result = hashObjectSync(obj);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle arrays", () => {
      const obj = {
        items: ["apple", "banana", "cherry"],
        numbers: [1, 2, 3],
      };
      const result = hashObjectSync(obj);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should produce different hashes for arrays with same elements in different order", () => {
      const obj1 = { items: ["apple", "banana", "cherry"] };
      const obj2 = { items: ["banana", "apple", "cherry"] };
      const hash1 = hashObjectSync(obj1);
      const hash2 = hashObjectSync(obj2);
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty object", () => {
      const result = hashObjectSync({});
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle null and undefined values", () => {
      const obj = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: "test",
      };
      const result = hashObjectSync(obj);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle boolean values", () => {
      const obj = {
        isTrue: true,
        isFalse: false,
        name: "test",
      };
      const result = hashObjectSync(obj);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle mixed data types", () => {
      const obj = {
        string: "hello",
        number: 42,
        boolean: true,
        array: [1, "two", { three: 3 }],
        nested: {
          date: "2023-01-01",
          count: 0,
        },
      };
      const result = hashObjectSync(obj);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });

    it("should produce different hashes when properties are added", () => {
      const obj1 = { name: "test" };
      const obj2 = { name: "test", extra: "property" };
      const hash1 = hashObjectSync(obj1);
      const hash2 = hashObjectSync(obj2);
      expect(hash1).not.toBe(hash2);
    });

    it("should produce different hashes when properties are removed", () => {
      const obj1 = { name: "test", value: 42 };
      const obj2 = { name: "test" };
      const hash1 = hashObjectSync(obj1);
      const hash2 = hashObjectSync(obj2);
      expect(hash1).not.toBe(hash2);
    });

    it("should handle objects with many properties", () => {
      const largeObj: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largeObj[`prop${i}`] = `value${i}`;
      }
      const result = hashObjectSync(largeObj);
      expect(result).toEqual(expect.any(String));
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Cross-function consistency", () => {
    it("should produce different hashes for string vs object with same content", () => {
      const str = "hello";
      const obj = { value: "hello" };
      const stringHash = hashStringSync(str);
      const objectHash = hashObjectSync(obj);
      expect(stringHash).not.toBe(objectHash);
    });

    it("should produce different hashes for number as string vs number", () => {
      const strObj = { value: "42" };
      const numObj = { value: 42 };
      const stringHash = hashObjectSync(strObj);
      const numberHash = hashObjectSync(numObj);
      expect(stringHash).not.toBe(numberHash);
    });
  });
});
