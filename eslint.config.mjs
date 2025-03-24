import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

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
      "**/.cache/**",
      "**/.esm-cache/**",
      "**/.wrangler/**",
    ],
  },
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      "no-console": ["warn"],
      "import/no-duplicates": ["error"],
    },
  },
  {
    rules: {
      "no-restricted-globals": ["error", "URL", "TextDecoder", "TextEncoder"],
    },
  },
);

export default opts;
