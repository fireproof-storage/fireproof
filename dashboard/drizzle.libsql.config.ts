import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/db-api-schema.js",
  out: "./dist",
  dbCredentials: {
    url: "./dist/sqlite.db",
  },
});
