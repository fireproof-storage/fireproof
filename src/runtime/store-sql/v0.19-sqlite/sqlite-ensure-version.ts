import { SQLiteConnection } from "../sqlite-adapter-better-sqlite3";
import { SQLITE_VERSION } from "./version";
import { ResolveOnce } from "@adviser/cement";

const once = new ResolveOnce<void>();
export async function ensureSQLiteVersion(dbConn: SQLiteConnection) {
  once.once(async () => {
    await dbConn.client
      .prepare(
        `CREATE TABLE IF NOT EXISTS version (
          version TEXT NOT NULL,
          updated_at TEXT NOT NULL)`,
      )
      .run();
    const rows = (await dbConn.client.prepare(`select version from version`).all()) as { version: string }[];
    if (rows.length > 1) {
      throw new Error(`more than one version row found:${JSON.stringify(rows)}`);
    }
    if (rows.length === 0) {
      await dbConn.client
        .prepare(`insert into version (version, updated_at) values (?, ?)`)
        .run(SQLITE_VERSION, new Date().toISOString());
      return;
    }
    if (rows[0].version !== SQLITE_VERSION) {
      console.warn(`version mismatch: ${dbConn.url.toString()} expected ${SQLITE_VERSION}, got ${rows[0]}`);
    }
  });
}
