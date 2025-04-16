import type { Database } from "@fireproof/core";
import type { UseFireproof, UseFPConfig } from "./types.js";
import { createAttach } from "./create-attach.js";
import { useMemo } from "react";

// Import our new module-level hooks
import { 
  useFireproofDatabase, 
  createFireproofHooks 
} from "./module-hooks.js";

/**
 * @deprecated Use the `useFireproof` hook instead
 */
export const FireproofCtx = {} as UseFireproof;

/**
 * ## Summary
 *
 * React hook to create a custom-named Fireproof database and provides utility hooks to query against it.
 *
 * ## Usage
 * ```tsx
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname");
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname", { ...options });
 * ```
 */
export function useFireproof(name: string | Database = "useFireproof", config: UseFPConfig = {}): UseFireproof {
  // Get the database instance using our module-level hook
  const database = useFireproofDatabase(name, config);
  
  // Create and memoize the hooks object to maintain stable identity
  const hookObject = useMemo(() => {
    // Create the attach function
    const attach = createAttach(database, config);
    
    // Get hook functions bound to this database
    const boundHooks = createFireproofHooks(database);
    
    // Return the complete API object with same shape as before
    return { 
      database, 
      ...boundHooks,
      attach 
    };
  }, [database, JSON.stringify(config)]); // Only recreate if database or config changes
  
  return hookObject;
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
