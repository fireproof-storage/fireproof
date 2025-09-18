//process.env.FP_STORAGE_URL = "memory://test";
//process.env.FP_KEYBAG_URL = "memory://keybag";

(globalThis as unknown as Record<symbol, Record<string, string>>)[Symbol.for("FP_PRESET_ENV")] = {
  FP_STORAGE_URL: "memory://test",
  FP_KEYBAG_URL: "memory://keybag",
};
