import { URI } from "@adviser/cement";
import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";

let url: string;
if (process.env.DASH_FP_TEST_SQL_URL) {
  url = URI.from(process.env.DASH_FP_TEST_SQL_URL).pathname;
  console.warn("DASH_FP_TEST_SQL_URL set to:", url);
} else {
  url = "./dist/dash-backend.sqlite";
}

fs.mkdirSync(path.dirname(url), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "../backend/db-api-schema.ts",
  out: "./dist",
  dbCredentials: { url },
});
