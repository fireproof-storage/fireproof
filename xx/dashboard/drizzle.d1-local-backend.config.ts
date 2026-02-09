import { defineConfig } from "drizzle-kit";
import * as path from "path";
import * as fs from "fs";

function getLocalD1DB(): string {
  const basePath = path.resolve("./.wrangler");
  const dbFile = fs.readdirSync(basePath, { encoding: "utf-8", recursive: true }).find((f) => f.endsWith(".sqlite"));

  if (!dbFile) {
    throw new Error(`.sqlite file not found in ${basePath}`);
  }

  const url = path.resolve(basePath, dbFile);
  console.log("getLocalD1DB:", url);
  return url;
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/db-api-schema.ts",
  out: "./dist",
  dbCredentials: {
    url: getLocalD1DB(),
  },
});
