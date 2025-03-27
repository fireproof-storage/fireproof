import type { ConfigOpts, Database } from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import type { UseFireproof } from "./types.js";
import { createUseDocument } from "./useDocument.js";
import { createUseLiveQuery } from "./useLiveQuery.js";
import { createUseAllDocs } from "./useAllDocs.js";
import { createUseChanges } from "./useChanges.js";

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
