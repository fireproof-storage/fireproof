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
 * const todo = useDocument({
 *   text: '',
 *   date: Date.now(),
 *   completed: false
 * })
 * // Access via object properties
 * todo.doc // The current document
 * todo.merge({ completed: true }) // Update specific fields
 * todo.replace({ text: 'new', date: Date.now(), completed: false }) // Replace entire doc
 * todo.save() // Save changes
 * todo.remove() // Delete document
 * todo.reset() // Reset to initial state
 * todo.refresh() // Refresh from database
 * ```
 *
 * ### Create document with custom ID
 * Custom IDs let you create predictable document identifiers for data that has
 * a natural unique key, like userIds or email addresses. This makes it easy to
 * look up and update specific documents without having to query for them first.
 * For example, storing user profiles by customerId:
 *
 * ```tsx
 * const profile = useDocument({
 *   _id: `${props.customerId}-profile`, // Predictable ID based on customerId
 *   name: "",
 *   company: "",
 *   startedAt: Date.now()
 * })
 * ```
 *
 * ## API
 *
 * - `doc`: The current document state
 * - `merge(newDoc)`: Merge new properties into the document
 * - `replace(newDoc)`: Replace the entire document
 * - `reset()`: Reset to initial state
 * - `refresh()`: Refresh from database
 * - `save()`: Save changes to the document
 * - `remove()`: Delete the document
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useDocument = topLevelUseDocument as TLUseDocument;
