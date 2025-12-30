/**
 * Sandbox service for safe query execution.
 * Uses quickjs-emscripten WASM to isolate user code from the host environment.
 *
 * Security model:
 * - User code executes in isolated WASM context
 * - No access to DOM, network, or filesystem
 * - Only read-only document array exposed
 * - Execution timeout enforced
 * - Dangerous patterns blocked before execution
 */
import { getQuickJS, QuickJSContext, QuickJSHandle } from "quickjs-emscripten";
import { QUERY_TIMEOUT_MS } from "../helpers.js";

/**
 * Result of code validation.
 */
export interface ValidationResult {
  /** Whether the code passed validation. */
  valid: boolean;
  /** Error message if validation failed. */
  error?: string;
}

/**
 * Document type for sandbox execution.
 * Represents a Fireproof document with ID.
 */
export interface SandboxDocument {
  _id: string;
  [key: string]: unknown;
}

/**
 * Result of map function execution in sandbox.
 */
export interface MapResult {
  /** Key emitted by the map function. */
  key: unknown;
  /** Value emitted by the map function. */
  value: unknown;
}

/**
 * Patterns that are blocked before code reaches the sandbox.
 * These patterns indicate dangerous operations that should never execute.
 * This is best-effort validation; the sandbox is the primary security boundary.
 */
const BLOCKED_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /\bfetch\s*\(/, description: "fetch() calls are not allowed" },
  { pattern: /\bXMLHttpRequest\b/, description: "XMLHttpRequest is not allowed" },
  { pattern: /\bimport\s*\(/, description: "Dynamic imports are not allowed" },
  { pattern: /\brequire\s*\(/, description: "require() calls are not allowed" },
  { pattern: /\beval\s*\(/, description: "eval() is not allowed" },
  { pattern: /\bFunction\s*\(/, description: "Function constructor is not allowed" },
  { pattern: /\.constructor\s*\(/, description: "Constructor access is not allowed" },
  { pattern: /\bwindow\b/, description: "window object access is not allowed" },
  { pattern: /\bdocument\b/, description: "document object access is not allowed" },
  { pattern: /\blocalStorage\b/, description: "localStorage access is not allowed" },
  { pattern: /\bsessionStorage\b/, description: "sessionStorage access is not allowed" },
  { pattern: /\bglobalThis\b/, description: "globalThis access is not allowed" },
];

/** Singleton QuickJS instance. */
let quickJSInstance: Awaited<ReturnType<typeof getQuickJS>> | null = null;

/** Flag indicating if sandbox is available. */
let sandboxAvailable: boolean | null = null;

/**
 * Initialize the QuickJS WASM sandbox.
 * Must be called before using other sandbox functions.
 * Safe to call multiple times - will return cached result.
 *
 * @returns Promise resolving to true if sandbox is available, false otherwise
 */
export async function initSandbox(): Promise<boolean> {
  if (sandboxAvailable !== null) {
    return sandboxAvailable;
  }

  try {
    quickJSInstance = await getQuickJS();
    sandboxAvailable = true;
    return true;
  } catch (error) {
    console.error("Failed to initialize QuickJS sandbox:", error);
    sandboxAvailable = false;
    return false;
  }
}

/**
 * Check if the sandbox is available.
 * Returns null if initSandbox() hasn't been called yet.
 *
 * @returns true if available, false if unavailable, null if not yet initialized
 */
export function isSandboxAvailable(): boolean | null {
  return sandboxAvailable;
}

/**
 * Validate code for dangerous patterns before execution.
 * Performs static analysis to block obviously malicious code.
 *
 * @param code - The JavaScript code to validate
 * @returns Validation result with error message if invalid
 */
export function validateCode(code: string): ValidationResult {
  // Check for blocked patterns
  for (const { pattern, description } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { valid: false, error: description };
    }
  }

  // Try to parse as a function expression
  try {
    // Use Function constructor just for syntax validation
    // This is safe because we're not executing the result
    new Function(`return (${code})`);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Syntax error: ${(error as Error).message}`,
    };
  }
}

/**
 * Execute a map function in the sandbox with the provided documents.
 * The map function receives (doc, emit) and should call emit(key, value).
 *
 * @param code - The map function code as a string
 * @param docs - Array of documents to process
 * @param timeoutMs - Execution timeout in milliseconds (default from config)
 * @returns Promise resolving to array of emitted results
 * @throws Error if sandbox unavailable, code invalid, or execution fails
 */
export async function executeMapFn(
  code: string,
  docs: SandboxDocument[],
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<MapResult[]> {
  // Ensure sandbox is initialized
  if (sandboxAvailable === null) {
    await initSandbox();
  }

  if (!sandboxAvailable || !quickJSInstance) {
    throw new Error("Query sandbox is unavailable. Please refresh the page.");
  }

  // Validate code first
  const validation = validateCode(code);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Create a new context for this execution
  const vm = quickJSInstance.newContext();

  try {
    // Collect emitted results
    const results: MapResult[] = [];

    // Create emit function that collects results
    const emitHandle = vm.newFunction("emit", (keyHandle, valueHandle) => {
      const key = vm.dump(keyHandle);
      const value = vm.dump(valueHandle);
      results.push({ key, value });
    });

    // Set up the execution environment
    vm.setProp(vm.global, "emit", emitHandle);
    emitHandle.dispose();

    // Serialize documents to JSON for the sandbox
    const docsJson = JSON.stringify(docs);

    // Create the execution code
    const executionCode = `
      (function() {
        const mapFn = (${code});
        const docs = ${docsJson};
        const emit = globalThis.emit;

        for (const doc of docs) {
          mapFn(doc, emit);
        }

        return true;
      })()
    `;

    // Execute with timeout
    const result = await executeWithTimeout(vm, executionCode, timeoutMs);

    if (result.error) {
      const errorMessage = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`Query execution error: ${JSON.stringify(errorMessage)}`);
    }

    result.value?.dispose();

    return results;
  } finally {
    vm.dispose();
  }
}

/**
 * Execute code in the QuickJS context with a timeout.
 *
 * @param vm - QuickJS context
 * @param code - Code to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Execution result
 */
async function executeWithTimeout(
  vm: QuickJSContext,
  code: string,
  timeoutMs: number
): Promise<{ value?: QuickJSHandle; error?: QuickJSHandle }> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return vm.evalCode(code);
  }

  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  const runtime = vm.runtime;

  runtime.setInterruptHandler(() => {
    if (Date.now() > deadline) {
      timedOut = true;
      return true;
    }
    return false;
  });

  try {
    const result = vm.evalCode(code);
    if (timedOut) {
      result.error?.dispose();
      result.value?.dispose();
      throw new Error(`Query execution timed out after ${timeoutMs}ms`);
    }
    return result;
  } catch (error) {
    if (timedOut) {
      throw new Error(`Query execution timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    runtime.removeInterruptHandler();
  }
}

/**
 * Filter documents using a map function in the sandbox.
 * Convenience wrapper that returns documents that emit any value.
 *
 * @param code - The map function code as a string
 * @param docs - Array of documents to filter
 * @param timeoutMs - Execution timeout in milliseconds
 * @returns Promise resolving to filtered documents with their emitted values
 */
export async function filterDocsWithMapFn(
  code: string,
  docs: SandboxDocument[],
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<{ doc: SandboxDocument; key: unknown; value: unknown }[]> {
  const results = await executeMapFn(code, docs, timeoutMs);

  // Create a map from doc _id to emit results
  const docResultMap = new Map<string, { key: unknown; value: unknown }>();
  for (const result of results) {
    // The value should be the document or contain _id
    const doc = result.value as SandboxDocument;
    if (doc && typeof doc === "object" && "_id" in doc) {
      docResultMap.set(doc._id, { key: result.key, value: result.value });
    }
  }

  // Return documents that were emitted
  return docs
    .filter((doc) => docResultMap.has(doc._id))
    .map((doc) => {
      const result = docResultMap.get(doc._id);
      return {
        doc,
        key: result?.key,
        value: result?.value,
      };
    });
}
