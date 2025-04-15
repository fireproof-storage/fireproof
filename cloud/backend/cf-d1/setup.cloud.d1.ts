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

// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// (globalThis as any)["abels"] = { status: 'loaded' }

// async function setup() {
//   console.log('Running global setup from vitest.setup.ts...');

//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   (globalThis as any)['meno'] = { status: 'loaded' }; // Example async result

//   console.log('Global setup complete. Data attached to globalThis.');
//   // return {status 'loaded'}; // Return value isn't directly used by tests, but good practice
// }

// // Execute the setup. Vitest runs the code in this file.
// await setup(); // Use await if setup is async
