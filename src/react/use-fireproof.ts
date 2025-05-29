import { toSortedArray } from "@adviser/cement/utils";
import { Database, fireproof } from "@fireproof/core";
import { useMemo } from "react";
import { createAttach } from "./use-attach.js";
import type { UseFPConfig, UseFireproof } from "./types.js";
import { createUseAllDocs } from "./use-all-docs.js";
import { createUseChanges } from "./use-changes.js";
import { createUseDocument } from "./use-document.js";
import { createUseLiveQuery } from "./use-live-query.js";

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
export function useFireproof(name: string | Database = "useFireproof", config: UseFPConfig = {}): UseFireproof {
  const strConfig = JSON.stringify(toSortedArray(config));
  const database = useMemo(() => (typeof name === "string" ? fireproof(name, config) : name), [name, strConfig]);
  const attach = createAttach(database, config);

  const useDocument = useMemo(() => createUseDocument(database), [database.name, strConfig]);
  const useLiveQuery = useMemo(() => createUseLiveQuery(database), [database.name, strConfig]);
  const useAllDocs = useMemo(() => createUseAllDocs(database), [database.name, strConfig]);
  const useChanges = useMemo(() => createUseChanges(database), [database.name, strConfig]);

  return { database, useLiveQuery, useDocument, useAllDocs, useChanges, attach };
}

// Export types
export type {
  AllDocsResult,
  ChangesResult,
  LiveQueryResult,
  UseAllDocs,
  UseChanges,
  UseDocument,
  UseDocumentResult,
  UseFireproof,
  UseLiveQuery,
} from "./types.js";
