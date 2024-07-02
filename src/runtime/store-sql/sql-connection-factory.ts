import { ensureLogger } from "./ensurer.js";
import { SQLiteConnection } from "./sqlite-adapter-better-sqlite3.js";
import { DBConnection, SQLOpts } from "./types.js";

export function SQLConnectionFactory(databaseURL: URL, opts?: Partial<SQLOpts>): DBConnection {
  const logger = ensureLogger(opts, "SQLFactory");
  switch (databaseURL.protocol) {
    case "sqlite:":
      logger.Debug().Str("databaseURL", databaseURL.toString()).Msg("connecting to sqlite");
      return SQLiteConnection.fromURL(databaseURL, {
        ...opts,
        logger,
      });
    default:
      throw logger
        .Error()
        .Msg("unsupported protocol " + databaseURL.protocol)
        .AsError();
  }
}
