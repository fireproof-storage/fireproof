import { fireproof } from "../fireproof/dist/node/fireproof.js";
import { SimpleSQLite } from "./dist/node/sqlite-adapter-node.cjs";

import { LoggerImpl, Level } from "@adviser/cement";

async function main() {
  const logger = new LoggerImpl(); // .EnableLevel(Level.DEBUG);
  logger.Debug("test");

  const db = fireproof("my-database", {
    store: SimpleSQLite("sqlite.db", {
      logger,
    }),
  });

  // const connection = new ConnectSQL(SimpleSQLite("sqlite.db"));
  // await connection.connect(db.blockstore);
  const ok = await db.put({ hello: "world:" + new Date().toISOString() });
  logger.Info().Any("RES->", ok).Msg("put");

  const rows = await db.allDocs();
  logger.Info().Any("RES->", rows).Msg("All docs");

  // const doc = await db.get(ok.id);
  // console.log(doc);

  // console.log(await db.allDocs());
}

main().catch(console.error);
