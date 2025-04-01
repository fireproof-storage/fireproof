import type { ConfigOpts, Database } from "@fireproof/core";
import { fireproof } from "@fireproof/core";
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
 * React hook to use a custom-named Fireproof database.
 *
 * ## Usage
 * ```tsx
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname");
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname", { ...options });
 * ```
 *
 * ## Overview
 *
 * `useFireproof` takes the name of your database and returns React hooks: `useLiveQuery` and `useDocument`.
 *
 * `useLiveQuery` is the recommended way to query Fireproof in React and subscribe to changes.
 * `useDocument` is useful for things like forms where documents are being created from an initial state, saved, and updated.
 * `useFireproof` will also return a `database` instance with the usual methods like `put` and `query`.
 * 
 * Everything that `useFireproof` returns is scoped to the database with that name. If you're working with multiple
 * databases you may want to destructure like this:
 * ```tsx
 * const { useLiveQuery: useLiveDucksQuery } = useFireproof("ducks");
 * const { useLiveQuery: useLiveGeeseQuery } = useFireproof("geese");
 * ```
 *
 */
export function useFireproof(name: string | Database = "useFireproof", config: ConfigOpts = {}): UseFireproof {
  const database = typeof name === "string" ? fireproof(name, config) : name;

  const useDocument = createUseDocument(database);
  const useLiveQuery = createUseLiveQuery(database);
  const useAllDocs = createUseAllDocs(database);
  const useChanges = createUseChanges(database);

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
