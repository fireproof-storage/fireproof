/* eslint-disable react-hooks/rules-of-hooks */
import { Database, DocRecord } from "@fireproof/core";

import { LiveQueryResult, useFireproof, UseLiveQuery } from "./useFireproof";

export type TLUseLiveQuery = {
  <T extends DocRecord<T>>(...args: Parameters<UseLiveQuery>): LiveQueryResult<T>;
  database: Database;
};

function topLevelUseLiveQuery(...args: Parameters<UseLiveQuery>) {
  const { useLiveQuery, database } = useFireproof();
  (topLevelUseLiveQuery as TLUseLiveQuery).database = database;
  return useLiveQuery(...args);
}

/**
 * ## Summary
 * React hook that provides access to live query results, enabling real-time updates in your app. This uses
 * the default database named "useFireproof" under the hood which you can also access via the `database` accessor.
 *
 * ## Usage
 * ```tsx
 * const results = useLiveQuery("date"); // using string
 * const results = useLiveQuery((doc) => doc.date)); // using map function
 * const database = useLiveQuery.database; // underlying "useFireproof" database accessor
 * ```
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useLiveQuery = topLevelUseLiveQuery as TLUseLiveQuery;
