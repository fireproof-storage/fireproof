import { Database } from "@fireproof/core";
import { Accessor } from "solid-js";
import { type CreateLiveQuery, createFireproof } from "./createFireproof";

export type TLCreateLiveQuery = {
  (...args: Parameters<CreateLiveQuery>): ReturnType<CreateLiveQuery>;
  database: Accessor<Database>;
};

function topLevelCreateLiveQuery(...args: Parameters<CreateLiveQuery>) {
  const { createLiveQuery, database } = createFireproof();
  (topLevelCreateLiveQuery as TLCreateLiveQuery).database = database;
  return createLiveQuery(...args);
}

/**
 * ### Usage
 * ```tsx
 * const results = createLiveQuery("date"); // using string
 * const results = createLiveQuery((doc) => doc.date)); // using map function
 * const database = createLiveQuery.database; // underlying "@fireproof/db" database accessor
 * ```
 *
 * ### Summary
 * SolidJS hook that provides access to live query results, enabling real-time updates in your app. This uses
 * the default database named "@fireproof/db" under the hood which you can also access via the `database` accessor.
 *
 *
 * ### Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `createLiveQuery` and `createDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const createLiveQuery = topLevelCreateLiveQuery as TLCreateLiveQuery;
