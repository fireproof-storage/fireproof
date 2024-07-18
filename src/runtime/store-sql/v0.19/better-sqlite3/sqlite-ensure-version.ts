import { V0_19BS3Connection } from "./sqlite-connection";
import { V0_19SQL_VERSION } from "../version";
import { ResolveOnce } from "@adviser/cement";
import { ensureLogger } from "../../../../utils";

const once = new ResolveOnce<string>();
export async function ensureBS3Version(url: URL, dbConn: V0_19BS3Connection) {
  const version = await once.once(async () => {
    const logger = ensureLogger(dbConn.opts, "ensureBS3Version", {
      version: V0_19SQL_VERSION,
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
        .run(V0_19SQL_VERSION, new Date().toISOString());
      return V0_19SQL_VERSION;
    }
    if (rows[0].version !== V0_19SQL_VERSION) {
      logger.Warn().Any("row", rows[0]).Msg(`version mismatch`);
    }
    return rows[0].version;
  });
  url.searchParams.set("version", version);
}
