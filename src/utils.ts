import { Logger, LoggerImpl, IsLogger, Result } from "@adviser/cement";
import { SysContainer } from "./runtime";
import { uuidv7 } from "uuidv7";

export type { Logger };

const globalLogger: Logger = new LoggerImpl();

export interface LoggerOpts {
  readonly logger?: Logger;
}

const FP_DEBUG = Symbol.for("FP_DEBUG");

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
  let debug = SysContainer.env.get("FP_DEBUG");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof globalThis === "object" && (globalThis as any)[FP_DEBUG]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any)[FP_DEBUG];
    if (Array.isArray(ctx)) {
      debug = ctx.join(",");
    } else {
      debug = ctx as string;
    }
  }
  if (ctx) {
    if ("debug" in ctx) {
      if (typeof ctx.debug === "string" && ctx.debug.length > 0) {
        debug = [debug, ctx.debug].filter((i) => i).join(",");
      } else {
        debug = [debug, componentName].filter((i) => i).join(",");
      }
      // console.log("ctx.debug", ctx.debug, debug)
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
  // debug = componentName
  if (debug && debug.length > 0) {
    const modules = debug.split(/\s*,\s*/).filter((i) => !!i);
    logger.SetDebug(...modules);
  }
  const out = cLogger.Logger();
  // out.Debug().Msg("logger ready");
  return out;
}

export type Joiner = (...toJoin: string[]) => string;

export function getStore(url: URL, logger: Logger, joiner: Joiner): string {
  let result = url.searchParams.get("store");
  if (!result) throw logger.Error().Str("url", url.toString()).Msg(`store not found`).AsError();
  if (url.searchParams.has("index")) {
    result = joiner(url.searchParams.get("index") || "idx", result);
  }
  return result;
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
