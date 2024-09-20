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
    ],
  },
  {
    rules: {
      "no-console": ["warn"],
//      "@typescript-eslint/explicit-function-return-type": "error",
    },
  },
);

export default opts;
