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
  // Get or create the database instance
  const database = useFireproofDatabase(name, config);
  
  // Create hook functions bound to this database using the factory function
  const hooks = useMemo(() => createFireproofHooks(database), [database]);
  
  // Create the attachment function
  const attach = createAttach(database, config);
  
  // Return the same API shape as the original implementation
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
