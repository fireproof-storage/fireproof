import { Logger, LoggerImpl } from "@adviser/cement";
import { SQLOpts, SQLTableNames, DefaultSQLTableNames } from "./types";

const globalLogger = new LoggerImpl();

// export const textEncoder = new TextEncoder()
// export const textDecoder = new TextDecoder()

export function ensureLogger(opts: Partial<SQLOpts> | undefined, componentName: string): Logger {
  // if (!opts?.logger) {
  //   throw new Error("logger is required");
  // }
  const logger = opts?.logger || globalLogger;
  if (componentName) {
    return logger.With().Module(componentName).Logger();
  }
  return logger;
}

function ensureTableNames(opts?: Partial<SQLOpts>): SQLTableNames {
  return opts?.tableNames || DefaultSQLTableNames;
}

const textEncoder = new TextEncoder();
function ensureTextEncoder(opts?: Partial<SQLOpts>): TextEncoder {
  return opts?.textEncoder || textEncoder;
}

const textDecoder = new TextDecoder();
function ensureTextDecoder(opts?: Partial<SQLOpts>): TextDecoder {
  return opts?.textDecoder || textDecoder;
}

function url2sqlFlavor(url: URL): "sqlite" | "mysql" | "postgres" {
  const flavor = url.protocol.replace(/:.*$/, "");
  switch (flavor) {
    case "sqlite":
    case "mysql":
    case "postgres":
      return flavor;
    default:
      throw new Error("unsupported protocol " + flavor);
  }
}

export function ensureSQLOpts(url: URL, opts: Partial<SQLOpts> | undefined, componentName: string): SQLOpts {
  return {
    url,
    sqlFlavor: url2sqlFlavor(url),
    tableNames: ensureTableNames(opts),
    logger: ensureLogger(opts, componentName),
    textEncoder: ensureTextEncoder(opts),
    textDecoder: ensureTextDecoder(opts),
  };
}
