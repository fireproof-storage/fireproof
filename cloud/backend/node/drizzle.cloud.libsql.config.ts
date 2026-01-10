import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../base/meta-merger/schema.ts",
  out: "./dist",
  dbCredentials: {
    url: process.env.FP_SQLITE_URL || "./dist/sqlite.db",
  },
});
