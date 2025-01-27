import { Ledger, DocTypes, DocWithId } from "@fireproof/core";

import { UseDocument, UseDocumentResult, useFireproof } from "./useFireproof.js";

export interface TLUseDocument {
  <T extends DocTypes>(initialDoc: DocWithId<T>): UseDocumentResult<T>;
  ledger: Ledger;
}

function topLevelUseDocument(...args: Parameters<UseDocument>) {
  const { useDocument, ledger } = useFireproof();
  (topLevelUseDocument as TLUseDocument).ledger = ledger;
  return useDocument(...args);
}

/**
 * ## Summary
 *
 * React hook that provides the ability to create new Fireproof documents. The creation occurs when
 * you do not pass in an `_id` as part of your initial document -- the ledger will assign a new one when
 * you call the provided `save` handler This uses the default ledger named `useFireproof` under the hood which you can also
 * access via the `ledger` accessor.
 *
 * ## Usage
 *
 * ```tsx
 * const [todo, setTodo, saveTodo] = useDocument(() => ({
 *   text: '',
 *   date: Date.now(),
 *   completed: false
 * }))
 *
 * const [doc, setDoc, saveDoc] = useDocument(() => ({
 *   _id: `${props.customerId}-profile`, // you can imagine `customerId` as a prop passed in
 *   name: "",
 *   company: "",
 *   startedAt: Date.now()
 * }))
 *
 * const ledger = useDocument.ledger; // underlying "useFireproof" ledger accessor
 * ```
 *
 * ## Overview
 * Changes made via remote sync peers, or other members of your cloud replica group will appear automatically
 * when you use the `useLiveQuery` and `useDocument` APIs. By default, Fireproof stores data in the browser's
 * local storage.
 */
export const useDocument = topLevelUseDocument as TLUseDocument;
