import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core-cli",
    exclude: ["dist/**", "node_modules/**", "react/**", "examples/**", "gateway/indexeddb"],
    include: ["**/*test.?(c|m)[jt]s?(x)"],
  },
});
