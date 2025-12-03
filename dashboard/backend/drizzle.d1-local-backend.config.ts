import { defineConfig } from "drizzle-kit";
import * as path from "path";
import * as fs from "fs";
import { $ } from "zx";

function getLocalD1DB(): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  $.sync`wrangler --config ../frontend/wrangler.toml d1 execute test-auth-db --local --command="select 1"`;
  const basePath = path.resolve("../frontend/.wrangler");
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
  schema: "../backend/db-api-schema.ts",
  out: "./dist",
  dbCredentials: {
    url: getLocalD1DB(),
  },
});
