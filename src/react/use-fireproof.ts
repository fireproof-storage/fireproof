import type { ConfigOpts, Database } from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { useMemo } from "react";
import type { UseFireproof } from "./types.js";
import { createUseDocument } from "./use-document.js";
import { createUseLiveQuery } from "./use-live-query.js";
import { createUseAllDocs } from "./use-all-docs.js";
import { createUseChanges } from "./use-changes.js";

/**
 * @deprecated Use the `useFireproof` hook instead
 */
export const FireproofCtx = {} as UseFireproof;

/**
 *
 * ## Summary
 *
 * React hook to create a custom-named Fireproof database and provides the utility hooks to query against it.
 *
 * ## Usage
 * ```tsx
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname");
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname", { ...options });
 * ```
 *
 *
 */
export function useFireproof(name: string | Database = "useFireproof", config: ConfigOpts = {}): UseFireproof {
  // Use useMemo to ensure stable references across renders
  return useMemo(() => {
    const database = typeof name === "string" ? fireproof(name, config) : name;

    const useDocument = createUseDocument(database);
    const useLiveQuery = createUseLiveQuery(database);
    const useAllDocs = createUseAllDocs(database);
    const useChanges = createUseChanges(database);

    return { database, useLiveQuery, useDocument, useAllDocs, useChanges };
  }, [name, JSON.stringify(config)]); // Only recreate if name or stringified config changes
}

// Export types
export type {
  LiveQueryResult,
  UseDocumentResult,
  AllDocsResult,
  ChangesResult,
  UseDocument,
  UseLiveQuery,
  UseAllDocs,
  UseChanges,
  UseFireproof,
} from "./types.js";
