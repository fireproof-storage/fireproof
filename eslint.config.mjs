import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const opts = tseslint.config(
  eslint.configs.recommended,
  //   ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    ignores: [
      "babel.config.cjs",
      "jest.config.js",
      "**/dist/",
      "**/pubdir/",
      "**/node_modules/",
      "**/scripts/",
      "**/examples/",
      "scripts/",
      "smoke/react/",
      "src/missingTypes/lib.deno.d.ts",
      "**/.esm-cache/**",
    ],
  },
  {
    rules: {
      "no-console": ["warn"],
    },
  },
  {
    rules: {
      "no-restricted-globals": ["error", "URL", "TextDecoder", "TextEncoder"],
    },
  },
);

export default opts;
