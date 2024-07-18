import { ensureLogger } from "../../utils.js";
import { DBConnection, SQLOpts } from "./types.js";
import { v0_19sqliteConnectionFactory } from "./v0.19/sqlite_factory.js";

export function SQLConnectionFactory(databaseURL: URL, opts: Partial<SQLOpts> = {}): Promise<DBConnection> {
  const logger = ensureLogger(opts, "SQLFactory");
  switch (databaseURL.protocol) {
    case "sqlite:":
      logger.Debug().Str("databaseURL", databaseURL.toString()).Msg("connecting to sqlite");
      return v0_19sqliteConnectionFactory(databaseURL, {
        ...opts,
        logger
      });
    default:
      throw logger
        .Error()
        .Msg("unsupported protocol " + databaseURL.protocol)
        .AsError();
  }
}
