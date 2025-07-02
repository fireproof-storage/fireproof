import { setPresetEnv } from "@fireproof/core-runtime";

// console.log("setup:libsql", process.env);
setPresetEnv({
  FP_KEYBAG_URL: "memory://keybag",
});
