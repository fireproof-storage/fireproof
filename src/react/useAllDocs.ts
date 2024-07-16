import { Database, DocTypes } from "@fireproof/core";

import { AllDocsResult, useFireproof, UseAllDocs } from "./useFireproof";

export interface TLUseAllDocs {
  <T extends DocTypes>(...args: Parameters<UseAllDocs>): AllDocsResult<T>;
  database: Database;
}

function topLevelUseAllDocs(...args: Parameters<UseAllDocs>) {
  const { useAllDocs, database } = useFireproof();
  (topLevelUseAllDocs as TLUseAllDocs).database = database;
  return useAllDocs(...args);
}

/**
 * ## Summary
 * React hook that provides access to all documents in the database, sorted by `_id`.
 *
 * ## Usage
 * ```tsx
 * const result = useAllDocs({ limit: 10, descending: true }); // with options
 * const result = useAllDocs(); // without options
 * const database = useAllDocs.database; // underlying "useFireproof" database accessor
 * ```
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useAllDocs` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useAllDocs = topLevelUseAllDocs as TLUseAllDocs;
