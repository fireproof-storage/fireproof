import { Database, DocTypes } from "@fireproof/core";

import { ChangesResult, useFireproof, UseChanges } from "./useFireproof";

export interface TLUseChanges {
  <T extends DocTypes>(...args: Parameters<UseChanges>): ChangesResult<T>;
  database: Database;
}

function topLevelUseChanges(...args: Parameters<UseChanges>) {
  const { useChanges, database } = useFireproof();
  (topLevelUseChanges as TLUseChanges).database = database;
  return useChanges(...args);
}

/**
 * ## Summary
 * React hook that provides access to all new documents in the database added since the last time the changes was called
 *
 * ## Usage
 * ```tsx
 * const result = useChanges(prevresult.clock,{limit:10}); // with options
 * const result = useChanges(); // without options
 * const database = useChanges.database; // underlying "useFireproof" database accessor
 * ```
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useAllDocs`, `useChanges` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useChanges = topLevelUseChanges as TLUseChanges;
