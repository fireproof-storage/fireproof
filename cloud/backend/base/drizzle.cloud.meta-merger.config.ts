import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./meta-merger/schema.ts",
  out: "./dist",
  dbCredentials: {
    url: "./dist/cloud-backend-meta-merger.sqlite",
  },
});
