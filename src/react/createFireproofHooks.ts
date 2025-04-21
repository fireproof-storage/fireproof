import type { Database } from "@fireproof/core";
import { createUseDocument } from "./use-document.js";
import { createUseLiveQuery } from "./use-live-query.js";
import { createUseAllDocs } from "./use-all-docs.js";
import { createUseChanges } from "./use-changes.js";
import type { UseFireproof } from "./types.js";

/**
 * Creates a set of Fireproof hooks for a specific database instance.
 * This follows React's rules of hooks by creating the hooks at module level.
 * 
 * @param database The Fireproof database instance to use
 * @returns An object containing all the Fireproof hooks
 */
export function createFireproofHooks(database: Database): Omit<UseFireproof, "database"> {
  // Create all the hooks once per database instance
  const useDocument = createUseDocument(database);
  const useLiveQuery = createUseLiveQuery(database);
  const useAllDocs = createUseAllDocs(database);
  const useChanges = createUseChanges(database);

  // Return a stable object with all the hooks
  return {
    useDocument,
    useLiveQuery,
    useAllDocs,
    useChanges,
    // Stub attach property - needed to match UseFireproof type
    get attach() {
      return { state: "initial" };
    }
  };
}
