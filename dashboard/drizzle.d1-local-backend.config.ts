import { defineConfig } from "drizzle-kit";
import * as path from "path";
import * as fs from "fs";

function getLocalD1DB() {
  try {
    const basePath = path.resolve("./backend/.wrangler");
    const dbFile = fs.readdirSync(basePath, { encoding: "utf-8", recursive: true }).find((f) => f.endsWith(".sqlite"));

    if (!dbFile) {
      throw new Error(`.sqlite file not found in ${basePath}`);
    }

    const url = path.resolve(basePath, dbFile);
    return url;
  } catch (err) {
    console.log(`Error  ${err.message}`);
  }
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/db-api-schema.ts",
  out: "./dist",
  dbCredentials: {
    url: getLocalD1DB(),
  },
});
