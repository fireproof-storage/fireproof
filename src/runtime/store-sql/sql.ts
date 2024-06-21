import { SQLOpts, SQLiteConnection, ensureLogger } from "./sqlite-adapter-node";
import { DBConnection } from "./types";

export function SQLFactory(databaseURL: URL, opts?: Partial<SQLOpts>): DBConnection {
  const logger = ensureLogger(opts, "SQLFactory");
  switch (databaseURL.protocol) {
    case "sqlite:":
      logger.Info().Str("databaseURL", databaseURL.toString()).Msg("connecting to sqlite");
      return SQLiteConnection.fromFilename(databaseURL.hostname);
    default:
      throw logger
        .Error()
        .Msg("unsupported protocol " + databaseURL.protocol)
        .AsError();
  }
}
