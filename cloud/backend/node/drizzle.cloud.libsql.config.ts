import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./cloud/backend/meta-merger/schema.ts",
  out: "./dist",
  dbCredentials: {
    url: process.env.FP_TEST_SQLITE_FILE ?? "./dist/cloud-backend-node.sqlite",
  },
});
