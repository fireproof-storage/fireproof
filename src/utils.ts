import { Logger, LoggerImpl, IsLogger, Result, ResolveOnce } from "@adviser/cement";
import { SysContainer } from "./runtime";
import { uuidv7 } from "uuidv7";
import { StoreType } from "./types";

export type { Logger };
export { Result };

const globalLogger: Logger = new LoggerImpl();

export interface LoggerOpts {
  readonly logger?: Logger;
}

const registerFP_DEBUG = new ResolveOnce();

export function ensureLogger(
  optsOrLogger: Partial<LoggerOpts> | Logger,
  componentName: string,
  ctx?: Record<string, unknown>,
): Logger {
  // if (!opts?.logger) {
  //   throw new Error("logger is required");
  // }
  let logger = globalLogger;
  if (IsLogger(optsOrLogger)) {
    logger = optsOrLogger;
  } else if (optsOrLogger && IsLogger(optsOrLogger.logger)) {
    logger = optsOrLogger.logger;
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
      cLogger.Str("this", uuidv7());
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
          } else if (value instanceof URL) {
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
      SysContainer.env.onSet((key, value) => {
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
export function getStore(url: URL, logger: Logger, joiner: Joiner): Store {
  const store = url.searchParams.get("store");
  switch (store) {
    case "data":
    case "wal":
    case "meta":
      break;
    default:
      throw logger.Error().Url(url).Msg(`store not found`).AsError();
  }
  let name: string = store;
  if (url.searchParams.has("index")) {
    name = joiner(url.searchParams.get("index") || "idx", name);
  }
  return { store, name };
}

export function getKey(url: URL, logger: Logger): string {
  const result = url.searchParams.get("key");
  if (!result) throw logger.Error().Str("url", url.toString()).Msg(`key not found`).AsError();
  return result;
}

export function getName(url: URL, logger: Logger): string {
  let result = url.searchParams.get("name");
  if (!result) {
    result = SysContainer.dirname(url.pathname);
    if (result.length === 0) {
      throw logger.Error().Str("url", url.toString()).Msg(`name not found`).AsError();
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

// the big side effect party --- hate it
export function sanitizeURL(url: URL) {
  url.searchParams.sort();
  // const searchParams = Object.entries(url.searchParams).sort(([a], [b]) => a.localeCompare(b));
  // console.log("searchParams", searchParams);
  // for (const [key] of searchParams) {
  //   url.searchParams.delete(key);
  // }
  // for (const [key, value] of searchParams) {
  //   url.searchParams.set(key, value);
  // }
}
