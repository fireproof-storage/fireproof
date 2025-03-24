// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gthis(): any {
  return globalThis;
}

gthis()[Symbol.for("FP_PRESET_ENV")] = {
  // FP_KEYBAG_URL = "memory://keybag"
  // FP_DEBUG: "metaStoreFactory"
};
