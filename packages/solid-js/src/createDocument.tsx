import { Database } from "@fireproof/core";
import { Accessor } from "solid-js";
import { CreateDocument, createFireproof } from "./createFireproof";

export type TLCreateDocument = {
  (...args: Parameters<CreateDocument>): ReturnType<CreateDocument>;
  database: Accessor<Database>;
};

function topLevelCreateDocument(...args: Parameters<CreateDocument>) {
  const { createDocument, database } = createFireproof();
  (topLevelCreateDocument as TLCreateDocument).database = database;
  return createDocument(...args);
}

/**
 * ### Usage
 *
 * ```tsx
 * const [todo, setTodo, saveTodo] = createDocument({
 *   text: '',
 *   date: Date.now(),
 *   completed: false
 * })
 *
 * const [doc, setDoc, saveDoc] = createDocument({
 *   _id: `${customerId}-profile`, // you can imagine `customerId` as a prop passed in
 *   name: "",
 *   company: "",
 *   startedAt: Date.now()
 * })
 *
 * const database = createDocument.database; // underlying "@fireproof/db" database accessor
 * ```
 *
 * ### Summary
 *
 * SolidJS hook that provides the ability to create new Fireproof documents. The creation occurs when
 * you do not pass in an `_id` as part of your initial document -- the database will assign a new one when
 * you call the provided `save` handler This uses the default database named `@fireproof/db` under the hood which you can also
 * access via the `database` accessor.
 *
 *
 * ### Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `createLiveQuery` and `createDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const createDocument = topLevelCreateDocument as TLCreateDocument;
