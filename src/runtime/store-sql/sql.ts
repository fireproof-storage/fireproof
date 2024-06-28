import { Level, LoggerImpl } from "@adviser/cement";
import { SQLOpts, SQLiteConnection, ensureLogger } from "./sqlite-adapter-node.js";
import { DBConnection } from "./types.js";

export function SQLFactory(databaseURL: URL, opts?: Partial<SQLOpts>): DBConnection {
  const logger = ensureLogger(opts, "SQLFactory");
  switch (databaseURL.protocol) {
    case "sqlite:":
      logger.Info().Str("databaseURL", databaseURL.toString()).Msg("connecting to sqlite");
      return SQLiteConnection.fromURL(databaseURL, {
        logger: new LoggerImpl().EnableLevel(Level.DEBUG),
      });
    default:
      throw logger
        .Error()
        .Msg("unsupported protocol " + databaseURL.protocol)
        .AsError();
  }
}
