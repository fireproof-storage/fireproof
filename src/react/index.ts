export {
  type TLUseDocument,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useDocument,
} from "./useDocument";
export { FireproofCtx, type UseFireproof, useFireproof } from "./useFireproof";
export {
  type TLUseLiveQuery,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useLiveQuery,
} from "./useLiveQuery";
export {
  type TLUseAllDocs,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useAllDocs,
} from "./useAllDocs";
export {
  type TLUseChanges,
  /** @deprecated Use return values from useFireproof('dbname') instead. Top level usage will be removed in future versions. */
  useChanges,
} from "./useChanges";
// why is this there is should be a package system
// export * from "@fireproof/core";
