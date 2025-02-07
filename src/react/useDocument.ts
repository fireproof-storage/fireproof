import { Database, DocTypes, DocWithId } from "@fireproof/core";

import { UseDocument, UseDocumentResult, useFireproof } from "./useFireproof.js";

export interface TLUseDocument {
  <T extends DocTypes>(initialDoc: DocWithId<T>): UseDocumentResult<T>;
  database: Database;
}

function topLevelUseDocument(...args: Parameters<UseDocument>) {
  const { useDocument, database } = useFireproof();
  (topLevelUseDocument as TLUseDocument).database = database;
  return useDocument(...args);
}

/**
 * ## Summary
 *
 * React hook that provides the ability to create and manage Fireproof documents. The creation occurs when
 * you do not pass in an `_id` as part of your initial document -- the database will assign a new one when
 * you call the provided `save` handler.
 *
 * ## Usage
 *
 * ```tsx
 * const { doc, update, save } = useDocument(() => ({
 *   text: '',
 *   date: Date.now(),
 *   completed: false
 * }))
 *
 * const { doc, update, save } = useDocument(() => ({
 *   _id: `${props.customerId}-profile`,
 *   name: "",
 *   company: "",
 *   startedAt: Date.now()
 * }))
 * ```
 *
 * ## API
 *
 * - `doc`: The current document state
 * - `update(newDoc)`: Merge new properties into the document
 * - `replace(newDoc)`: Replace the entire document
 * - `save(newDoc?)`: Save changes to the managed document, optionally pass in a new document to save
 * - `remove()`: Delete the document
 * - `reset()`: Reset to initial state
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useDocument = topLevelUseDocument as TLUseDocument;
