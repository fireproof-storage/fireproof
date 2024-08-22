import {
  Logger,
  LoggerImpl,
  IsLogger,
  Result,
  ResolveOnce,
  isURL,
  URI,
  CoerceURI,
  runtimeFn,
  envFactory,
  Env,
  toCryptoRuntime,
  CryptoRuntime,
  BuildURI,
} from "@adviser/cement";
import { PathOps, StoreType, SuperThis, SuperThisOpts, TextEndeCoder } from "./types";
import { base58btc } from "multiformats/bases/base58";

export type { Logger, CoerceURI };
export { Result, URI, BuildURI };

const globalLogger: Logger = new LoggerImpl();

const registerFP_DEBUG = new ResolveOnce();

interface superThisOpts {
  readonly logger: Logger;
  readonly env: Env;
  readonly pathOps: PathOps;
  readonly crypto: CryptoRuntime;
  readonly ctx: Record<string, unknown>;
  readonly txt: TextEndeCoder;
}

class superThis implements SuperThis {
  readonly logger: Logger;
  readonly env: Env;
  readonly pathOps: PathOps;
  readonly ctx: Record<string, unknown>;
  readonly txt: TextEndeCoder;
  readonly crypto: CryptoRuntime;

  constructor(opts: superThisOpts) {
    this.logger = opts.logger;
    this.env = opts.env;
    this.crypto = opts.crypto;
    this.pathOps = opts.pathOps;
    this.txt = opts.txt;
    this.ctx = { ...opts.ctx };
    // console.log("superThis", this);
  }

  nextId(): string {
    return base58btc.encode(this.crypto.randomBytes(12));
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  clone(override: Partial<SuperThisOpts>): SuperThis {
    return new superThis({
      logger: override.logger || this.logger,
      env: envFactory(override.env) || this.env,
      crypto: override.crypto || this.crypto,
      pathOps: override.pathOps || this.pathOps,
      txt: override.txt || this.txt,
      ctx: { ...this.ctx, ...override.ctx },
    });
  }
}

// const pathOps =
function presetEnv() {
  const penv = new Map([
    // ["FP_DEBUG", "xxx"],
    // ["FP_ENV", "development"],
    ...Array.from(
      Object.entries(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((globalThis as any)[Symbol.for("FP_PRESET_ENV")] || {}) as Record<string, string>,
      ),
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
  // homedir() {
  //     throw new Error("SysContainer:homedir is not available in seeded state");
  //   }
}
const pathOps = new pathOpsImpl();
const txtOps = {
  encode: (input: string) => new TextEncoder().encode(input),
  decode: (input: Uint8Array) => new TextDecoder().decode(input),
};

export function ensureSuperThis(osthis?: Partial<SuperThisOpts>): SuperThis {
  const env = envFactory({
    symbol: osthis?.env?.symbol || "FP_ENV",
    presetEnv: osthis?.env?.presetEnv || presetEnv(),
  });
  console.log("ensureSuperThis", env.get("FP_DEBUG"));
  return new superThis({
    logger: osthis?.logger || globalLogger,
    env,
    crypto: osthis?.crypto || toCryptoRuntime(),
    ctx: osthis?.ctx || {},
    pathOps,
    txt: osthis?.txt || txtOps,
  });
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
  // let logger = globalLogger;
  // if (IsLogger(sthis)) {
  //   logger = sthis;
  // } else if (sthis && IsLogger(sthis.logger)) {
  //   logger = sthis.logger;
  // }
  const logger = sthis.logger;
  const cLogger = logger.With().Module(componentName); //.Str("this", uuidv7());
  const debug: string[] = [];
  let exposeStack = false;
  let constructorLog = false
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
    if ("this" in ctx) {
      cLogger.Str("this", sthis.nextId());
      delete ctx.this;
    }
    if ("log" in ctx) {
      constructorLog = true;
      delete ctx.log;
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
          console.log("onSet=>", key, value, debug)
          switch (key) {
            case "FP_DEBUG":
              logger.SetDebug(value || []);
              break;
            case "FP_STACK":
              logger.SetExposeStack(!!value);
              break;
          }
        },
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
  if (constructorLog) {
    out.Debug().Msg("logger ready");
  }
  return out;
}

export type Joiner = (...toJoin: string[]) => string;

export interface Store {
  readonly store: StoreType;
  readonly name: string;
}

export function getStore(url: URI, sthis: SuperThis, joiner: Joiner): Store {
  const store = url.getParam("store");
  switch (store) {
    case "data":
    case "wal":
    case "meta":
      break;
    default:
      throw sthis.logger.Error().Url(url).Msg(`store not found`).AsError();
  }
  let name: string = store;
  if (url.hasParam("index")) {
    name = joiner(url.getParam("index") || "idx", name);
  }
  return { store, name };
}

export function getKey(url: URI, logger: Logger): string {
  const result = url.getParam("key");
  if (!result) throw logger.Error().Str("url", url.toString()).Msg(`key not found`).AsError();
  return result;
}

export function getName(sthis: SuperThis, url: URI): string {
  let result = url.getParam("name");
  if (!result) {
    result = sthis.pathOps.dirname(url.pathname);
    if (result.length === 0) {
      throw sthis.logger.Error().Str("url", url.toString()).Msg(`name not found`).AsError();
    }
  }
  return result;
}

export function exception2Result<T = void>(fn: () => Promise<T>): Promise<Result<T>> {
  return fn()
    .then((value) => Result.Ok(value))
    .catch((e) => Result.Err(e));
}

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

export function dataDir(sthis: SuperThis, name?: string, base?: CoerceURI): URI {
  if (!base) {
    if (!runtimeFn().isBrowser) {
      const home = sthis.env.get("HOME") || "./";
      base = sthis.env.get("FP_STORAGE_URL") || `file://${sthis.pathOps.join(home, ".fireproof")}`;
    } else {
      base = sthis.env.get("FP_STORAGE_URL") || `indexdb://fp`;
    }
  }
  // console.log("dataDir-0", base, typeof base);
  const ret = BuildURI.from(base)
    .setParam("name", name || "")
    .URI();
  // console.log("dataDir-1", base);
  return ret;
}

export function UInt8ArrayEqual(a: Uint8Array, b: Uint8Array) {
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
