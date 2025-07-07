import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/db-api-schema.ts",
  out: "./dist",
  dbCredentials: {
    url: "./dist/sqlite.db",
  },
});
