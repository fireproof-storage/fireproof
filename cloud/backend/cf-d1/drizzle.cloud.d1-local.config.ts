import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

function getLocalD1DB(): string {
  const basePath = path.resolve(path.join(__dirname, "./.wrangler"));
  const dbFile = fs.readdirSync(basePath, { encoding: "utf-8", recursive: true }).find((f) => f.endsWith(".sqlite"));

  if (!dbFile) {
    throw new Error(`.sqlite file not found in ${basePath}`);
  }

  const url = path.resolve(basePath, dbFile);
  // eslint-disable-next-line no-console
  console.log("getLocalD1DB:", url);
  return url;
}

export default defineConfig({
  schema: "./cloud/backend/meta-merger/schema.ts",
  out: "./dist",
  dialect: "sqlite",
  dbCredentials: {
    url: getLocalD1DB(),
  },
});
