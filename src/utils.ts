import { Logger, LoggerImpl, IsLogger, Result, ResolveOnce, isURL, URI, CoerceURI, runtimeFn } from "@adviser/cement";
import { StoreType, SuperThis, SuperThisOpts } from "./types";

export type { Logger };
export { Result };

const globalLogger: Logger = new LoggerImpl();

const registerFP_DEBUG = new ResolveOnce();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ensureSuperThis(sthis?: Partial<SuperThisOpts>): SuperThis {
  throw new Error("ensureSuperThis is not implemented");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ensureSuperLog(sthis: SuperThis, componentName: string, ctx?: Record<string, unknown>): SuperThis {
  throw new Error("ensureSuperThis is not implemented");
}

export function ensureLogger(
  sthis: SuperThis /* Partial<LoggerOpts> | Logger */,
  componentName: string,
  ctx?: Record<string, unknown>,
): Logger {
  // if (!opts?.logger) {
  //   throw new Error("logger is required");
  // }
  let logger = globalLogger;
  if (IsLogger(sthis)) {
    logger = sthis;
  } else if (sthis && IsLogger(sthis.logger)) {
    logger = sthis.logger;
  }
  const cLogger = logger.With().Module(componentName); //.Str("this", uuidv7());
  const debug: string[] = [];
  if (ctx) {
    if ("debug" in ctx) {
      if (typeof ctx.debug === "string" && ctx.debug.length > 0) {
        debug.push(ctx.debug);
      } else {
        debug.push(componentName);
      }
      delete ctx.debug;
    }
    if ("this" in ctx) {
      cLogger.Str("this", sthis.nextId());
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
      sthis.env.onSet((key, value) => {
        // console.log("FP_DEBUG", key, value, debug)
        if (value) {
          logger.SetDebug(value);
        }
      }, "FP_DEBUG");
    })
    .finally(() => {
      /* do nothing */
    });

  if (debug.length > 0) {
    logger.SetDebug(debug);
  }
  const out = cLogger.Logger();
  // out.Debug().Msg("logger ready");
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
      base = sthis.env.get("FP_STORAGE_URL") || `file://${sthis.pathOps.join(sthis.pathOps.homedir(), ".fireproof")}`;
    } else {
      base = sthis.env.get("FP_STORAGE_URL") || `indexdb://fp`;
    }
  }
  return URI.from(base.toString())
    .build()
    .setParam("name", name || "")
    .URI();
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
