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
  // Memoize the database instance to prevent re-creation on every render
  const database = useMemo(() => {
    return typeof name === "string" ? fireproof(name, config) : name;
  }, [typeof name === "string" ? name : name.name, config]);

  // Memoize the hook factory functions together to ensure they don't recreate on every render
  const hooks = useMemo(() => {
    return {
      useDocument: createUseDocument(database),
      useLiveQuery: createUseLiveQuery(database),
      useAllDocs: createUseAllDocs(database),
      useChanges: createUseChanges(database),
    };
  }, [database]);

  const { useDocument, useLiveQuery, useAllDocs, useChanges } = hooks;

  return { database, useLiveQuery, useDocument, useAllDocs, useChanges };
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
