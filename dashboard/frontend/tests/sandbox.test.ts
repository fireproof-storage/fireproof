/**
 * Security test suite for the query sandbox.
 * Tests that malicious patterns are blocked and the sandbox provides proper isolation.
 */
import { describe, it, expect } from "vitest";
import {
  initSandbox,
  isSandboxAvailable,
  validateCode,
  executeMapFn,
  SandboxDocument,
} from "../src/services/sandbox-service.js";

/** Whether the WASM sandbox is available in the test environment. */
const sandboxReady = await initSandbox();
/** Test helper that skips when the sandbox isn't available. */
const runIfSandbox = sandboxReady ? it : it.skip;

describe("Sandbox Security", () => {
  describe("validateCode - Blocked Patterns", () => {
    /** Verifies that fetch() calls are blocked. */
    it("blocks fetch() calls", () => {
      const result = validateCode('(doc, emit) => { fetch("http://evil.com"); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("fetch");
    });

    /** Verifies that XMLHttpRequest is blocked. */
    it("blocks XMLHttpRequest", () => {
      const result = validateCode("(doc, emit) => { new XMLHttpRequest(); emit(doc._id, doc); }");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("XMLHttpRequest");
    });

    /** Verifies that dynamic imports are blocked. */
    it("blocks dynamic imports", () => {
      const result = validateCode('(doc, emit) => { import("evil-module"); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("import");
    });

    /** Verifies that require() calls are blocked. */
    it("blocks require() calls", () => {
      const result = validateCode('(doc, emit) => { require("fs"); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("require");
    });

    /** Verifies that eval() in user code is blocked. */
    it("blocks eval() in user code", () => {
      const result = validateCode('(doc, emit) => { eval("malicious"); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("eval");
    });

    /** Verifies that Function constructor is blocked. */
    it("blocks Function constructor", () => {
      const result = validateCode('(doc, emit) => { new Function("return this")(); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Function");
    });

    /** Verifies that constructor chain access is blocked. */
    it("blocks constructor chain escapes", () => {
      const result = validateCode('(doc, emit) => { doc.constructor("malicious")(); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Constructor");
    });

    /** Verifies that window object access is blocked. */
    it("blocks window object access", () => {
      const result = validateCode("(doc, emit) => { window.location = 'http://evil.com'; emit(doc._id, doc); }");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("window");
    });

    /** Verifies that document object access is blocked. */
    it("blocks document object access", () => {
      const result = validateCode("(doc, emit) => { document.cookie; emit(doc._id, doc); }");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("document");
    });

    /** Verifies that localStorage access is blocked. */
    it("blocks localStorage access", () => {
      const result = validateCode('(doc, emit) => { localStorage.getItem("key"); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("localStorage");
    });

    /** Verifies that sessionStorage access is blocked. */
    it("blocks sessionStorage access", () => {
      const result = validateCode('(doc, emit) => { sessionStorage.getItem("key"); emit(doc._id, doc); }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain("sessionStorage");
    });

    /** Verifies that globalThis access is blocked. */
    it("blocks globalThis access", () => {
      const result = validateCode("(doc, emit) => { globalThis.fetch; emit(doc._id, doc); }");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("globalThis");
    });
  });

  describe("validateCode - Valid Patterns", () => {
    /** Verifies that valid map functions pass validation. */
    it("allows valid map functions", () => {
      const result = validateCode("(doc, emit) => { emit(doc._id, doc); }");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    /** Verifies that functions with conditionals pass validation. */
    it("allows functions with conditionals", () => {
      const result = validateCode('(doc, emit) => { if (doc.type === "user") emit(doc._id, doc); }');
      expect(result.valid).toBe(true);
    });

    /** Verifies that functions with loops pass validation. */
    it("allows functions with loops", () => {
      const result = validateCode("(doc, emit) => { for (const key of Object.keys(doc)) emit(key, doc); }");
      expect(result.valid).toBe(true);
    });

    /** Verifies that functions with array methods pass validation. */
    it("allows functions with array methods", () => {
      const result = validateCode("(doc, emit) => { doc.tags?.forEach(tag => emit(tag, doc)); }");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateCode - Syntax Errors", () => {
    /** Verifies that syntax errors are caught. */
    it("catches syntax errors", () => {
      const result = validateCode("(doc, emit) => { emit(doc._id, doc)");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Syntax error");
    });

    /** Verifies that invalid JavaScript is caught. */
    it("catches invalid JavaScript", () => {
      const result = validateCode("not valid javascript at all");
      expect(result.valid).toBe(false);
    });
  });

  describe("executeMapFn - Sandbox Execution", () => {
    const testDocs: SandboxDocument[] = [
      { _id: "doc1", name: "Alice", type: "user" },
      { _id: "doc2", name: "Bob", type: "user" },
      { _id: "doc3", name: "Post 1", type: "post" },
    ];

    /** Verifies that valid map functions execute correctly. */
    runIfSandbox("executes valid map functions", async () => {
      const results = await executeMapFn("(doc, emit) => { emit(doc._id, doc); }", testDocs);
      expect(results).toHaveLength(3);
      expect(results[0].key).toBe("doc1");
    });

    /** Verifies that map functions can filter documents. */
    runIfSandbox("filters documents based on map function", async () => {
      const results = await executeMapFn(
        '(doc, emit) => { if (doc.type === "user") emit(doc._id, doc); }',
        testDocs
      );
      expect(results).toHaveLength(2);
    });

    /** Verifies that blocked patterns are rejected during execution. */
    runIfSandbox("rejects blocked patterns during execution", async () => {
      await expect(executeMapFn('(doc, emit) => { fetch("http://evil.com"); }', testDocs)).rejects.toThrow(
        "fetch() calls are not allowed"
      );
    });

    /** Verifies that syntax errors are caught during execution. */
    runIfSandbox("rejects syntax errors during execution", async () => {
      await expect(executeMapFn("(doc, emit) => { emit(doc._id, doc)", testDocs)).rejects.toThrow("Syntax error");
    });
  });

  describe("executeMapFn - Timeout Protection", () => {
    /** Verifies that infinite loops are terminated by timeout. */
    runIfSandbox("enforces execution timeout", async () => {
      const testDocs: SandboxDocument[] = [{ _id: "doc1", name: "Test" }];

      // This should timeout - use a very short timeout for testing
      await expect(
        executeMapFn("(doc, emit) => { while(true) {} }", testDocs, 100) // 100ms timeout
      ).rejects.toThrow(/timed out/i);
    }, 5000); // Test timeout of 5 seconds
  });

  describe("Sandbox Availability", () => {
    /** Verifies that sandbox availability can be checked. */
    it("reports sandbox availability", () => {
      const available = isSandboxAvailable();
      // Should be either true, false, or null (if not initialized)
      expect([true, false, null]).toContain(available);
    });
  });
});
