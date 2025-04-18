import type { Database } from "@fireproof/core";
import type { UseFireproof, UseFPConfig } from "./types.js";
import { useMemo } from "react";
import { createFireproofHooks, useFireproofDatabase } from "./fixed-hooks.js";
import { createAttach } from "./create-attach.js";

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
  // Get a stable reference to the database instance
  const database = useFireproofDatabase(name, config);

  // Create the hooks bound to this database using our factory function
  const hooks = useMemo(() => createFireproofHooks(database), [database]);

  // Create the attach function
  const attach = createAttach(database, config);

  // Return the same API shape as before
  return { database, ...hooks, attach };
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
