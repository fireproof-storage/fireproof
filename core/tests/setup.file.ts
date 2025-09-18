process.env.FP_STORAGE_URL = "./dist/fp-dir-file";

(globalThis as unknown as Record<symbol, Record<string, string>>)[Symbol.for("FP_PRESET_ENV")] = {
  FP_STORAGE_URL: "./dist/fp-dir-file",
};
