function gthis(): Record<string | symbol, unknown> {
  return globalThis;
}

gthis()[Symbol.for("FP_PRESET_ENV")] = {
  // FP_KEYBAG_URL = "memory://keybag"
  // FP_DEBUG: "metaStoreFactory"
};
