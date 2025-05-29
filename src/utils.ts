import {
  Logger,
  LoggerImpl,
  IsLogger,
  Result,
  ResolveOnce,
  isURL,
  URI,
  envFactory,
  Env,
  toCryptoRuntime,
  CryptoRuntime,
  JSONFormatter,
  YAMLFormatter,
  CoerceURI,
  AppContext,
} from "@adviser/cement";
import { PARAM, PathOps, StoreType, SuperThis, SuperThisOpts, TextEndeCoder, PromiseToUInt8, ToUInt8 } from "./types.js";
import { base58btc } from "multiformats/bases/base58";
import { sha256 } from "multiformats/hashes/sha2";
import { CID } from "multiformats/cid";
import * as json from "multiformats/codecs/json";
import { toSortedArray } from "@adviser/cement/utils";

//export type { Logger };
//export { Result };

const _globalLogger = new ResolveOnce();
function globalLogger(): Logger {
  return _globalLogger.once(() => new LoggerImpl());
}

const registerFP_DEBUG = new ResolveOnce();

interface superThisOpts {
  readonly logger: Logger;
  readonly env: Env;
  readonly pathOps: PathOps;
  readonly crypto: CryptoRuntime;
  readonly ctx: AppContext;
  readonly txt: TextEndeCoder;
}

class SuperThisImpl implements SuperThis {
  readonly logger: Logger;
  readonly env: Env;
  readonly pathOps: PathOps;
  readonly ctx: AppContext;
  readonly txt: TextEndeCoder;
  readonly crypto: CryptoRuntime;

  constructor(opts: superThisOpts) {
    this.logger = opts.logger;
    this.env = opts.env;
    this.crypto = opts.crypto;
    this.pathOps = opts.pathOps;
    this.txt = opts.txt;
    this.ctx = AppContext.merge(opts.ctx);
    // console.log("superThis", this);
  }

  nextId(bytes = 6): { str: string; bin: Uint8Array } {
    const bin = this.crypto.randomBytes(bytes);
    return {
      str: base58btc.encode(bin),
      bin,
    };
  }

  timeOrderedNextId(now?: number): { str: string } {
    now = typeof now === "number" ? now : new Date().getTime();
    // 49th bit
    const t = (0x1000000000000 + now).toString(16).replace(/^1/, "");
    const bin = this.crypto.randomBytes(10);
    bin[1] = (bin[1] & 0xf0) | (bin[1] | 0x08 && 0x0b);
    const hex = Array.from(bin)
      .map((i) => i.toString(16).padStart(2, "0"))
      .join("");
    return {
      str: `${t.slice(0, 8)}-${t.slice(8)}-7${hex.slice(0, 3)}-${hex.slice(3, 7)}-${hex.slice(7, 19)}`,
    };
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  clone(override: Partial<SuperThisOpts>): SuperThis {
    return new SuperThisImpl({
      logger: override.logger || this.logger,
      env: envFactory(override.env) || this.env,
      crypto: override.crypto || this.crypto,
      pathOps: override.pathOps || this.pathOps,
      txt: override.txt || this.txt,
      ctx: AppContext.merge(this.ctx, override.ctx),
    });
  }
}

// const pathOps =
function presetEnv(ipreset?: Map<string, string> | Record<string, string>): Map<string, string> {
  let preset: Record<string, string> = {};
  if (ipreset instanceof Map) {
    preset = Object.fromEntries<string>(ipreset.entries());
  } else if (typeof ipreset === "object" && ipreset !== null) {
    preset = ipreset;
  }
  const penv = new Map([
    // ["FP_DEBUG", "xxx"],
    // ["FP_ENV", "development"],
    ...Array.from(
      Object.entries({
        ...setPresetEnv({}),
        ...preset,
      }),
    ), // .map(([k, v]) => [k, v as string])
  ]);
  // console.log(">>>>>>", penv)
  return penv;
}
// const envImpl = envFactory({
//   symbol: "FP_ENV",
//   presetEnv: presetEnv(),
// });
class pathOpsImpl implements PathOps {
  join(...paths: string[]): string {
    return paths.map((i) => i.replace(/\/+$/, "")).join("/");
  }
  dirname(path: string) {
    return path.split("/").slice(0, -1).join("/");
  }
  basename(path: string): string {
    return path.split("/").pop() || "";
  }
  // homedir() {
  //     throw new Error("SysContainer:homedir is not available in seeded state");
  //   }
}
const pathOps = new pathOpsImpl();
const txtOps = ((txtEncoder, txtDecoder) => ({
  encode: (input: string) => txtEncoder.encode(input),
  decode: (input: ToUInt8) => txtDecoder.decode(coerceIntoUint8(input).Ok()),
  // eslint-disable-next-line no-restricted-globals
}))(new TextEncoder(), new TextDecoder());

const _onSuperThis = new Map<string, (sthis: SuperThis) => void>();
export function onSuperThis(fn: (sthis: SuperThis) => void): () => void {
  const key = `onSuperThis-${Math.random().toString(36).slice(2)}`;
  _onSuperThis.set(key, fn);
  return () => {
    _onSuperThis.delete(key);
  };
}

export function ensureSuperThis(osthis?: Partial<SuperThisOpts>): SuperThis {
  const env = envFactory({
    symbol: osthis?.env?.symbol || "FP_ENV",
    presetEnv: presetEnv(osthis?.env?.presetEnv),
  });
  const ret = new SuperThisImpl({
    logger: osthis?.logger || globalLogger(),
    env,
    crypto: osthis?.crypto || toCryptoRuntime(),
    ctx: AppContext.merge(osthis?.ctx),
    pathOps,
    txt: osthis?.txt || txtOps,
  });
  _onSuperThis.forEach((fn) => fn(ret));
  return ret;
}

// // eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ensureSuperLog(sthis: SuperThis, componentName: string, ctx?: Record<string, unknown>): SuperThis {
  return sthis.clone({
    logger: ensureLogger(sthis, componentName, ctx),
  });
}

export function ensureLogger(
  sthis: SuperThis /* Partial<LoggerOpts> | Logger */,
  componentName: string,
  ctx?: Record<string, unknown>,
): Logger {
  // if (!opts?.logger) {
  //   throw new Error("logger is required");
  // }
  let logger: Logger;
  if (sthis && IsLogger(sthis.logger)) {
    logger = sthis.logger;
  } else {
    logger = globalLogger();
  }
  const cLogger = logger.With().Module(componentName); //.Str("this", uuidv7());
  const debug: string[] = [];
  let exposeStack = false;
  if (ctx) {
    if ("debug" in ctx) {
      if (typeof ctx.debug === "string" && ctx.debug.length > 0) {
        debug.push(ctx.debug);
      } else {
        debug.push(componentName);
      }
      delete ctx.debug;
    }
    if ("exposeStack" in ctx) {
      exposeStack = true;
      delete ctx.exposeStack;
    }
    if ("exposeStack" in ctx) {
      exposeStack = true;
      delete ctx.exposeStack;
    }
    if ("this" in ctx) {
      cLogger.Str("this", sthis.nextId(4).str);
      delete ctx.this;
    }
    for (const [key, value] of Object.entries(ctx)) {
      switch (typeof value) {
        case "string":
          cLogger.Str(key, value);
          break;
        case "number":
          cLogger.Uint64(key, value);
          break;
        default:
          if (value instanceof Date) {
            cLogger.Str(key, value.toISOString());
          } else if (isURL(value)) {
            cLogger.Str(key, value.toString());
          } else if (typeof value === "function") {
            cLogger.Ref(key, value);
          } else {
            cLogger.Any(key, value);
          }
          break;
      }
    }
  }
  registerFP_DEBUG
    .once(async () => {
      // console.log("registerFP_DEBUG", SysContainer.env)
      sthis.env.onSet(
        (key, value) => {
          // console.log("FP_DEBUG", key, value, debug)
          switch (key) {
            case "FP_FORMAT": {
              switch (value) {
                case "jsonice":
                  logger.SetFormatter(new JSONFormatter(logger.TxtEnDe(), 2));
                  break;
                case "yaml":
                  logger.SetFormatter(new YAMLFormatter(logger.TxtEnDe(), 2));
                  break;
                case "json":
                default:
                  logger.SetFormatter(new JSONFormatter(logger.TxtEnDe()));
                  break;
              }
              break;
            }
            case "FP_DEBUG":
              logger.SetDebug(value || []);
              break;
            case "FP_STACK":
              logger.SetExposeStack(!!value);
              break;
          }
        },
        "FP_FORMAT",
        "FP_DEBUG",
        "FP_STACK",
      );
    })
    .finally(() => {
      /* do nothing */
    });

  if (debug.length > 0) {
    logger.SetDebug(debug);
  }
  if (exposeStack) {
    logger.SetExposeStack(true);
  }
  const out = cLogger.Logger();
  if (sthis.env.get("FP_CONSTRUCTOR_DEBUG")) {
    out.Debug().Msg("constructor");
  }
  return out;
}

export type Joiner = (...toJoin: string[]) => string;

export interface Store {
  readonly pathPart: "data" | "wal" | "meta";
  readonly fromUrl: StoreType;
  readonly name: string;
}

export function getStore(url: URI, sthis: SuperThis, joiner: Joiner): Store {
  const fromUrl = url.getParam(PARAM.STORE) as StoreType;
  let pathPart: Store["pathPart"];
  switch (fromUrl) {
    case "car":
    case "file":
      pathPart = "data";
      break;
    case "wal":
    case "meta":
      pathPart = fromUrl;
      break;
    default:
      throw sthis.logger.Error().Url(url).Msg(`store not found`).AsError();
  }
  let name: string = pathPart;
  if (url.hasParam("index")) {
    name = joiner(url.getParam(PARAM.INDEX) || "idx", name);
  }
  return { pathPart, fromUrl, name };
}

export function getKey(url: URI, logger: Logger): string {
  const result = url.getParam(PARAM.KEY);
  if (!result) throw logger.Error().Str("url", url.toString()).Msg(`key not found`).AsError();
  return result;
}

export function getName(sthis: SuperThis, url: URI): string {
  let result = url.getParam(PARAM.NAME);
  if (!result) {
    result = sthis.pathOps.dirname(url.pathname);
    if (result.length === 0) {
      throw sthis.logger.Error().Str("url", url.toString()).Msg(`name not found`).AsError();
    }
  }
  return result;
}

// export function exception2Result<T = void>(fn: () => Promise<T>): Promise<Result<T>> {
//   return fn()
//     .then((value) => Result.Ok(value))
//     .catch((e) => Result.Err(e));
// }

export async function exceptionWrapper<T, E extends Error>(fn: () => Promise<Result<T, E>>): Promise<Result<T, E>> {
  return fn().catch((e) => Result.Err(e));
}

// // the big side effect party --- hate it
// export function sanitizeURL(url: URL) {
//   url.searchParams.sort();
//   // const searchParams = Object.entries(url.searchParams).sort(([a], [b]) => a.localeCompare(b));
//   // console.log("searchParams", searchParams);
//   // for (const [key] of searchParams) {
//   //   url.searchParams.delete(key);
//   // }
//   // for (const [key, value] of searchParams) {
//   //   url.searchParams.set(key, value);
//   // }
// }

export class NotFoundError extends Error {
  readonly code = "ENOENT";
}

export function isNotFoundError(e: Error | Result<unknown> | unknown): e is NotFoundError {
  if (Result.Is(e)) {
    if (e.isOk()) return false;
    e = e.Err();
  }
  if ((e as NotFoundError).code === "ENOENT") return true;
  return false;
}

export function UInt8ArrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function inplaceFilter<T>(i: T[], pred: (i: T, idx: number) => boolean): T[] {
  const founds: number[] = [];
  for (let j = 0; j < i.length; j++) {
    if (!pred(i[j], j)) {
      founds.push(j);
    }
  }
  for (let j = founds.length - 1; j >= 0; j--) {
    i.splice(founds[j], 1);
  }
  return i;
}

export function coerceIntoUint8(raw: ToUInt8): Result<Uint8Array> {
  if (raw instanceof Uint8Array) {
    return Result.Ok(raw);
  }
  if (Result.Is(raw)) {
    return raw;
  }
  return Result.Err("Not a Uint8Array");
}

export async function coercePromiseIntoUint8(raw: PromiseToUInt8): Promise<Result<Uint8Array>> {
  if (raw instanceof Uint8Array) {
    return Result.Ok(raw);
  }
  if (Result.Is(raw)) {
    return raw;
  }
  if (typeof raw.then === "function") {
    try {
      return coercePromiseIntoUint8(await raw);
    } catch (e) {
      return Result.Err(e as Error);
    }
  }
  return Result.Err("Not a Uint8Array");
}

export function makeName(fnString: string) {
  const regex = /\(([^,()]+,\s*[^,()]+|\[[^\]]+\],\s*[^,()]+)\)/g;
  let found: RegExpExecArray | null = null;
  const matches = Array.from(fnString.matchAll(regex), (match) => match[1].trim());
  if (matches.length === 0) {
    found = /=>\s*{?\s*([^{}]+)\s*}?/.exec(fnString);
    if (found && found[1].includes("return")) {
      found = null;
    }
  }
  if (!found) {
    return fnString;
  } else {
    // it's a consise arrow function, match everything after the arrow
    return found[1];
  }
}

export function storeType2DataMetaWal(store: StoreType) {
  switch (store) {
    case "car":
    case "file":
      return "data";
    case "meta":
    case "wal":
      return store;
    default:
      throw new Error(`unknown store ${store}`);
  }
}

export function ensureURIDefaults(
  sthis: SuperThis,
  names: { name: string; localURI?: URI },
  optsInput: { curi?: CoerceURI; public?: boolean; storeKey?: string | null } | CoerceURI | undefined,
  uriFallback: URI,
  store: StoreType,
  ctxParam?: Partial<{
    readonly idx: boolean;
    readonly file: boolean;
    readonly indexName?: string;
  }>,
): URI {
  const ctx = ctxParam || {}; // Ensure ctx is an object

  let effectiveOpts: { curi?: CoerceURI; public?: boolean; storeKey?: string | null } = {};
  let primaryUriSource: CoerceURI | undefined;

  // Discriminate optsInput
  if (optsInput === undefined) {
    // No optsInput provided; primaryUriSource remains undefined, effectiveOpts remains {}
  } else if (typeof optsInput === "string" || optsInput instanceof URI) {
    // optsInput is a direct URI string or a URI object instance
    primaryUriSource = optsInput;
  } else if (typeof optsInput === "object" && optsInput !== null && ("public" in optsInput || "storeKey" in optsInput)) {
    // optsInput is an object and has properties characteristic of the options object ({ curi?, public?, storeKey? })
    // This check helps distinguish it from other CoerceURI object types that might not have 'public' or 'storeKey'.
    effectiveOpts = optsInput as { curi?: CoerceURI; public?: boolean; storeKey?: string | null };
    primaryUriSource = effectiveOpts.curi;
  } else if (typeof optsInput === "object" && optsInput !== null) {
    // optsInput is an object, not undefined, not a string/URI, and not the options object identified above.
    // It's assumed to be one of the other CoerceURI types (e.g., BuildURI, MutableURL, or a plain object intended as a URI source).
    // URI.from() is expected to handle these CoerceURI types.
    primaryUriSource = optsInput as CoerceURI;
  }
  // If optsInput didn't match any condition (should not happen if types are correct), primaryUriSource is undefined and effectiveOpts is empty.

  // 1. Determine the base URI for parameter derivation
  const baseForParams = primaryUriSource ? URI.from(primaryUriSource) : URI.from(uriFallback);

  // 2. Determine the effective name and index name, prioritizing values from baseForParams
  const effectiveName = baseForParams.getParam(PARAM.NAME) || names.name;
  // For storeKey generation, use the index name from baseForParams if available, otherwise from ctxParam
  const storeKeyEffectiveIndexName = baseForParams.getParam(PARAM.INDEX) || ctxParam?.indexName;
  // For the final URI's PARAM.INDEX, also prioritize baseForParams, then ctxParam
  const uriEffectiveIndexName = baseForParams.getParam(PARAM.INDEX) || ctxParam?.indexName;

  // 3. Build the result URI, starting from baseForParams to inherit its other parameters
  const ret = baseForParams.build();

  // 4. Set core parameters
  ret.setParam(PARAM.STORE, store); // Set initial store type
  ret.setParam(PARAM.NAME, effectiveName);

  // 5. Suffix logic
  if (store === "car") {
    // If it's a car store, ensure it has the .car suffix.
    // Check if it's already there to avoid double suffixes if baseForParams already had it.
    if (ret.getParam(PARAM.SUFFIX) !== ".car") {
       ret.setParam(PARAM.SUFFIX, ".car");
    }
  }
  // For non-CAR stores, we do not modify the suffix. It remains as inherited from baseForParams.

  // 6. StoreKey logic
  let storeKeyVal: string;
  const skName = effectiveName;
  
  // Determine the part of the storeKey derived from the 'store' type
  let skStorePart: string;
  if (store === "car" || store === "file") {
    skStorePart = "data";
  } else {
    skStorePart = store; // "meta" or "wal"
  }
  
  const skIndexAffix = ctxParam?.idx ? `-${storeKeyEffectiveIndexName || "idx"}` : "";

  if (effectiveOpts.public === true) {
    storeKeyVal = `@insecure-${skName}-${skStorePart}${skIndexAffix}@`;
  } else if (effectiveOpts.storeKey) {
    storeKeyVal = effectiveOpts.storeKey;
  } else {
    storeKeyVal = `@${skName}-${skStorePart}${skIndexAffix}@`;
  }
  ret.setParam(PARAM.STORE_KEY, storeKeyVal);

  // 7. Set index parameter on the URI if it's an index store
  if (ctxParam?.idx) {
    ret.setParam(PARAM.INDEX, uriEffectiveIndexName || "idx");
  }

  // 8. Override store to "file" if ctxParam.file is true (must be after storeKey generation)
  if (ctxParam?.file) {
    ret.setParam(PARAM.STORE, "file");
  }

  // 9. Handle localName
  if (names.localURI) {
    const localNameFromURI = names.localURI.getParam(PARAM.NAME);
    if (localNameFromURI) {
      ret.setParam(PARAM.LOCAL_NAME, localNameFromURI);
    }
  }

  // Version and other defaults
  const fpVersion = sthis.env.get("FP_VERSION");
  if (fpVersion) {
    ret.defParam(PARAM.VERSION, fpVersion);
  }
  // If FP_VERSION is not set, do not add &version=unknown by default.

  if (sthis.env.get("FP_URL_GEN_RUNTIME")) {
    ret.defParam(PARAM.RUNTIME, sthis.env.get("FP_URL_GEN_RUNTIME"));
  }

  return ret.URI();
}

export function setPresetEnv(o: Record<string, string>, symbol = "FP_PRESET_ENV") {
  const key = Symbol.for(symbol);
  const env = (globalThis as unknown as Record<symbol, Record<string, string>>)[key] ?? {};
  for (const [k, v] of Object.entries(o)) {
    env[k] = v;
  }
  (globalThis as unknown as Record<symbol, Record<string, string>>)[key] = env;
  // console.log("setPresetEnv", key, env);
  return env;
}

export async function hashString(str: string): Promise<string> {
  const bytes = json.encode(str);
  const hash = await sha256.digest(bytes);
  return CID.create(1, json.code, hash).toString();
}

export async function hashObject<T extends NonNullable<S>, S>(o: T): Promise<string> {
  return (await hashObjectCID(o)).cid.toString();
}

export async function hashObjectCID<T extends NonNullable<S>, S>(o: T): Promise<{ cid: CID; bytes: Uint8Array; obj: T }> {
  // toSortedArray should be shallow
  const bytes = json.encode(toSortedArray(o));
  const hash = await sha256.digest(bytes);
  return { cid: CID.create(1, json.code, hash), bytes, obj: o };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deep clone a value
 */
export function deepClone<T>(value: T): T {
  return (structuredClone ?? ((v: T) => JSON.parse(JSON.stringify(v))))(value);
}
