// export async function setup() {
//     // eslint-disable-next-line no-console
//     console.log("setup");
//     console.log("setup");
//     console.log("setup");
//     console.log("setup");
//     console.log("setup");
//     console.log("setup");
//     console.log("setup");
//     console.log("setup");
//     return {
//         FP_KEYBAG_URL: "memory://keybag"
//     };
//   }

import { setPresetEnv } from "@fireproof/core";

setPresetEnv({
  FP_KEYBAG_URL: "memory://keybag",
});
