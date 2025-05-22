// import { AppContext } from "@adviser/cement";
import type {
  AllDocsQueryOpts,
  Attached,
  ChangesOptions,
  ClockHead,
  ConfigOpts,
  Database,
  DocFragment,
  DocResponse,
  DocSet,
  DocTypes,
  DocWithId,
  IndexKeyType,
  IndexRow,
  MapFn,
  QueryOpts,
  rt,
  SuperThis,
} from "@fireproof/core";
import { TokenAndClaims } from "../runtime/gateways/cloud/to-cloud.js";

export interface LiveQueryResult<T extends DocTypes, K extends IndexKeyType, R extends DocFragment = T> {
  readonly docs: DocWithId<T>[];
  readonly rows: IndexRow<K, T, R>[];
}

export type UseLiveQuery = <T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
  mapFn: string | MapFn<T>,
  query?: QueryOpts<K>,
  initialRows?: IndexRow<K, T, R>[],
) => LiveQueryResult<T, K, R>;

export interface AllDocsResult<T extends DocTypes> {
  readonly docs: DocWithId<T>[];
}

export interface ChangesResult<T extends DocTypes> {
  readonly docs: DocWithId<T>[];
}

export type UseAllDocs = <T extends DocTypes>(query?: AllDocsQueryOpts) => AllDocsResult<T>;

export type UseChanges = <T extends DocTypes>(since: ClockHead, opts: ChangesOptions) => ChangesResult<T>;

export interface UpdateDocFnOptions {
  replace?: boolean;
  reset?: boolean;
}

export type UpdateDocFn<T extends DocTypes> = (newDoc?: DocSet<T>, options?: UpdateDocFnOptions) => void;

export type StoreDocFn<T extends DocTypes> = (existingDoc?: DocWithId<T>) => Promise<DocResponse>;

export type DeleteDocFn<T extends DocTypes> = (existingDoc?: DocWithId<T>) => Promise<DocResponse>;

export type UseDocumentResultTuple<T extends DocTypes> = [DocWithId<T>, UpdateDocFn<T>, StoreDocFn<T>, DeleteDocFn<T>];

export interface UseDocumentResultObject<T extends DocTypes> {
  readonly doc: DocWithId<T>;
  merge(newDoc: Partial<T>): void;
  replace(newDoc: T): void;
  reset(): void;
  refresh(): Promise<void>;
  save(existingDoc?: DocWithId<T>): Promise<DocResponse>;
  remove(existingDoc?: DocWithId<T>): Promise<DocResponse>;
  submit(e?: Event): Promise<void>;
}

export type AttachStatus = "initial" | "attaching" | "attached" | "error";

export interface InitialAttachState {
  readonly state: "initial";
  readonly ctx: WebCtxHook;
}

export interface AttachingAttachState {
  readonly state: "attaching";
  readonly ctx: WebCtxHook;
}

export interface AttachedAttachState {
  readonly state: "attached";
  readonly attached: Attached;
  readonly ctx: WebCtxHook;
}

export interface ErrorAttachState {
  readonly state: "error";
  readonly error: Error;
  readonly ctx: WebCtxHook;
}

export type AttachState = InitialAttachState | AttachingAttachState | AttachedAttachState | ErrorAttachState;

export type UseDocumentResult<T extends DocTypes> = UseDocumentResultObject<T> & UseDocumentResultTuple<T>;

export type UseDocumentInitialDocOrFn<T extends DocTypes> = DocSet<T> | (() => DocSet<T>);
export type UseDocument = <T extends DocTypes>(initialDocOrFn: UseDocumentInitialDocOrFn<T>) => UseDocumentResult<T>;

export interface UseFireproof {
  readonly database: Database;
  readonly useDocument: UseDocument;
  readonly useLiveQuery: UseLiveQuery;
  readonly useAllDocs: UseAllDocs;
  readonly useChanges: UseChanges;
  readonly attach: AttachState; // changed from AttachState to function returning AttachState
}

export interface InitialTokenAndClaimsState {
  readonly state: "initial";
}
export interface ReadyTokenAndClaimsState {
  readonly state: "ready";
  readonly tokenAndClaims: TokenAndClaims;
  readonly reset: () => void;
}

export interface WebCtxHook {
  readonly tokenAndClaims: InitialTokenAndClaimsState | ReadyTokenAndClaimsState;
}

export interface WebToCloudCtx {
  readonly sthis: SuperThis;
  readonly dashboardURI: string; // https://dev.connect.fireproof.direct/fp/cloud/api/token
  readonly tokenApiURI: string; // https://dev.connect.fireproof.direct/api
  // stores connection and token
  keyBag?: rt.kb.KeyBagProvider;
  // readonly uiURI: string; // default "https://dev.connect.fireproof.direct/api"
  // url param name for token
  readonly tokenParam: string;

  ready(db: Database): Promise<void>;

  onTokenChange(on: (token?: TokenAndClaims) => void): void;
  resetToken(): Promise<void>;
  setToken(token: TokenAndClaims | string): Promise<void>;
  token(): Promise<TokenAndClaims | undefined>;
}

export type UseFPConfig = ConfigOpts & { readonly attach?: rt.gw.cloud.ToCloudAttachable };
