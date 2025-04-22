import type { DocTypes, Database } from "@fireproof/core";
import type { UseDocumentInitialDocOrFn, UseDocumentResult } from "./types.js";
import { useFireproofDocument } from "./use-fireproof-document.js";

/**
 * Implementation of the useDocument hook
 *
 * This is now a thin wrapper around useFireproofDocument that maintains
 * the exact same API for backward compatibility while fixing React hook rules.
 */
export function createUseDocument(database: Database) {
  // Create the wrapper function
  const useDocumentHook = <T extends DocTypes>(initialDocOrFn?: UseDocumentInitialDocOrFn<T>): UseDocumentResult<T> => {
    // Simply delegate to the module-level hook implementation
    return useFireproofDocument<T>(database, initialDocOrFn);
  };

  // Preserve the original hook name for React DevTools and HMR
  Object.defineProperty(useDocumentHook, "name", { value: "useDocument" });

  // Return the specially named hook
  return useDocumentHook;
}
