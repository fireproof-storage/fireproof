import { Ledger, DocFragment, DocTypes, IndexKeyType } from "@fireproof/core";

import { LiveQueryResult, useFireproof, UseLiveQuery } from "./useFireproof.js";

export interface TLUseLiveQuery {
  <T extends DocTypes, K extends IndexKeyType, R extends DocFragment = T>(
    ...args: Parameters<UseLiveQuery>
  ): LiveQueryResult<T, K, R>;
  ledger: Ledger;
}

function topLevelUseLiveQuery(...args: Parameters<UseLiveQuery>) {
  const { useLiveQuery, ledger } = useFireproof();
  (topLevelUseLiveQuery as TLUseLiveQuery).ledger = ledger;
  return useLiveQuery(...args);
}

/**
 * ## Summary
 * React hook that provides access to live query results, enabling real-time updates in your app. This uses
 * the default ledger named "useFireproof" under the hood which you can also access via the `ledger` accessor.
 *
 * ## Usage
 * ```tsx
 * const results = useLiveQuery("date"); // using string
 * const results = useLiveQuery((doc) => doc.date)); // using map function
 * const ledger = useLiveQuery.ledger; // underlying "useFireproof" ledger accessor
 * ```
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useLiveQuery = topLevelUseLiveQuery as TLUseLiveQuery;
