import { useMemo } from "react";
import { fireproof } from "@fireproof/core";
import type { ConfigOpts } from "@fireproof/core";
import { createFireproofHooks } from "./createFireproofHooks.js";
import type { UseFireproof } from "./types.js";
import { useFireproofDatabase } from "./use-database.js";

/**
 * Main hook to access Fireproof database and all its associated hooks.
 * This is the new recommended API for React applications using Fireproof.
 * 
 * It returns both the database instance and all hooks pre-bound to that instance,
 * ensuring proper React hooks compliance and stable hook identities across renders.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { database, useDocument, useLiveQuery } = useFireproof('my-db');
 *   const docResult = useDocument({ title: "New Document" });
 *   // ...
 * }
 * ```
 * 
 * @param name The database name (defaults to 'default')
 * @param config Optional configuration options
 * @returns The database instance and all associated hooks
 */
export function useFireproof(name = "default", config: ConfigOpts = {}): UseFireproof {
  // Get or create the database instance
  const database = useFireproofDatabase(name, config);
  
  // Create all hooks for this database (memoized to ensure stable identities)
  const hooks = useMemo(() => createFireproofHooks(database), [database]);
  
  // Return both the database and hooks as a single object
  return { database, ...hooks };
}
