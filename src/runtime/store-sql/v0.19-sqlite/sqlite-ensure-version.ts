import { SQLiteConnection } from "../sqlite-adapter-better-sqlite3";
import { SQLITE_VERSION } from "./version";
import { ResolveOnce } from "@adviser/cement";
import { ensureLogger } from "../../../utils";

const once = new ResolveOnce<string>();
export async function ensureSQLiteVersion(url: URL, dbConn: SQLiteConnection) {
  const version = await once.once(async () => {
    const logger = ensureLogger(dbConn.opts, "ensureSQLiteVersion", {
      version: SQLITE_VERSION,
      url: dbConn.url.toString(),
    });
    await dbConn.client
      .prepare(
        `CREATE TABLE IF NOT EXISTS version (
          version TEXT NOT NULL,
          updated_at TEXT NOT NULL)`,
      )
      .run();
    const rows = (await dbConn.client.prepare(`select version from version`).all()) as { version: string }[];
    if (rows.length > 1) {
      throw logger.Error().Msg(`more than one version row found`).AsError();
    }
    if (rows.length === 0) {
      await dbConn.client
        .prepare(`insert into version (version, updated_at) values (?, ?)`)
        .run(SQLITE_VERSION, new Date().toISOString());
      return SQLITE_VERSION;
    }
    if (rows[0].version !== SQLITE_VERSION) {
      logger.Warn().Any("row", rows[0]).Msg(`version mismatch`);
    }
    return rows[0].version;
  });
  url.searchParams.set("version", version);
}
