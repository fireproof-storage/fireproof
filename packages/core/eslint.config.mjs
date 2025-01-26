import tseslint from "typescript-eslint";

import shared from "../../eslint.shared.mjs";

const opts = tseslint.config(
  ...shared,
  {
    name: "@fireproof/core",
    rules: {
      "no-restricted-globals": ["error", "URL", "TextDecoder", "TextEncoder"],
    },
  },
  // ignores must be in a separate object so that they are used globally for
  // all every configuration object.
  {
    name: "@fireproof/core/ignores",
    ignores: [
      "src/missingTypes/lib.deno.d.ts",
    ],
  },
);

export default opts;
