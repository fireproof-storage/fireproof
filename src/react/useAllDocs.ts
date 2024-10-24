import { Ledger, DocTypes } from "@fireproof/core";

import { AllDocsResult, useFireproof, UseAllDocs } from "./useFireproof.js";

export interface TLUseAllDocs {
  <T extends DocTypes>(...args: Parameters<UseAllDocs>): AllDocsResult<T>;
  ledger: Ledger;
}

function topLevelUseAllDocs(...args: Parameters<UseAllDocs>) {
  const { useAllDocs, ledger } = useFireproof();
  (topLevelUseAllDocs as TLUseAllDocs).ledger = ledger;
  return useAllDocs(...args);
}

/**
 * ## Summary
 * React hook that provides access to all documents in the ledger, sorted by `_id`.
 *
 * ## Usage
 * ```tsx
 * const result = useAllDocs({ limit: 10, descending: true }); // with options
 * const result = useAllDocs(); // without options
 * const ledger = useAllDocs.ledger; // underlying "useFireproof" ledger accessor
 * ```
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useAllDocs` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useAllDocs = topLevelUseAllDocs as TLUseAllDocs;
