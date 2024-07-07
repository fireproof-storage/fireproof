import { Logger, LoggerImpl, IsLogger } from "@adviser/cement";

const globalLogger: Logger = new LoggerImpl();

export interface LoggerOpts {
  readonly logger?: Logger;
}

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
  const cLogger = logger.With().Module(componentName);
  if (ctx) {
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
          } else {
            cLogger.Any(key, value);
          }
          break;
      }
    }
  }
  return cLogger.Logger();
}
