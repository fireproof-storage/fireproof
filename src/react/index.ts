export {
  type TLUseDocument,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useDocument,
} from "./useDocument.js";
export { FireproofCtx, type UseFireproof, useFireproof, type LiveQueryResult, type UseDocumentResult } from "./useFireproof.js";
export {
  type TLUseLiveQuery,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useLiveQuery,
} from "./useLiveQuery.js";
export {
  type TLUseAllDocs,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useAllDocs,
} from "./useAllDocs.js";
export {
  type TLUseChanges,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useChanges,
} from "./useChanges.js";
// why is this there is should be a package system
// export * from "@fireproof/core";
