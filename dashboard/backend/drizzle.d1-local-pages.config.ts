import { defineConfig } from "drizzle-kit";
import * as path from "path";
import * as fs from "fs";

function getLocalD1DB() {
  const basePath = path.resolve("./.wrangler");
  const dbFile = fs.readdirSync(basePath, { encoding: "utf-8", recursive: true }).find((f) => f.endsWith(".sqlite"));

  if (!dbFile) {
    throw new Error(`.sqlite file not found in ${basePath}`);
  }

  const url = path.resolve(basePath, dbFile);
  return url;
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./db-api-schema.ts",
  out: "./dist",
  dbCredentials: {
    url: getLocalD1DB(),
  },
});
