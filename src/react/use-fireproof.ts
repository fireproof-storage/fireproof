import type { ConfigOpts, Database } from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { useMemo } from "react";
import type { UseFireproof } from "./types.js";
import { createUseDocument } from "./use-document.js";
import { createUseLiveQuery } from "./use-live-query.js";
import { createUseAllDocs } from "./use-all-docs.js";
import { createUseChanges } from "./use-changes.js";

// Global registry to ensure database singletons per name
const databaseRegistry: Record<string, Database> = {};

// Global registry to ensure hook singletons per database
const hooksRegistry = new Map<Database, ReturnType<typeof createHooks>>();

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
 * ## Overview
 *
 * TL;DR: Only use this hook if you need to configure a database name other than the default `useFireproof`.
 *
 * For most applications, using the `useLiveQuery` or `useDocument` hooks exported from `use-fireproof` should
 * suffice for the majority of use-cases. Under the hood, they act against a database named `useFireproof` instantiated with
 * default configurations. However, if you need to do a custom database setup or configure a database name more to your liking
 * than the default `useFireproof`, then use `useFireproof` as it exists for that purpose. It will provide you with the
 * custom database accessor and *lexically scoped* versions of `useLiveQuery` and `useDocument` that act against said
 * custom database.
 *
 */
export function useFireproof(name: string | Database = "useFireproof", config: ConfigOpts = {}): UseFireproof {
  // Use useMemo to ensure stable references across renders
  return useMemo(() => {
    // Handle the case where a database is passed directly
    if (typeof name !== "string") {
      // Get or create hooks for this database instance
      if (!hooksRegistry.has(name)) {
        hooksRegistry.set(name, createHooks(name));
      }
      
      // Return the database and its hooks
      return {
        database: name,
        ...(hooksRegistry.get(name) as ReturnType<typeof createHooks>)
      };
    }
    
    // For string names, get or create a database from the registry
    if (!databaseRegistry[name]) {
      databaseRegistry[name] = fireproof(name, config);
    }
    
    // Get the database instance
    const database = databaseRegistry[name];
    
    // Get or create hooks for this database
    if (!hooksRegistry.has(database)) {
      hooksRegistry.set(database, createHooks(database));
    }
    
    // Return the database and its hooks with stable references
    return {
      database,
      ...(hooksRegistry.get(database) as ReturnType<typeof createHooks>)
    };
  }, [name, JSON.stringify(config)]); // Only recreate if name or stringified config changes

}

// Helper function to create hooks with a stable reference
function createHooks(database: Database) {
  return {
    useDocument: createUseDocument(database),
    useLiveQuery: createUseLiveQuery(database),
    useAllDocs: createUseAllDocs(database),
    useChanges: createUseChanges(database),
  };
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
