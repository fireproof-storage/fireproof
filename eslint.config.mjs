import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

const opts = tseslint.config(
  eslint.configs.recommended,
  //   ...tseslint.configs.recommended,
  // ...tseslint.configs.strict,
  // ...tseslint.configs.stylistic,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        sourceType: "module",
        project: "./tsconfig.json",
        //        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      "babel.config.cjs",
      "prettier.config.js",
      "jest.config.js",
      "setup.*.js",
      "to-esm.js",
      "vitest.*.ts",
      "**/.esm-cache/**",
      "**/dist/",
      "dist/**",
      "**/pubdir/",
      "**/node_modules/",
      "**/scripts/",
      "**/examples/",
      "scripts/",
      "coverage/",
      "smoke/react/",
      "src/missingTypes/lib.deno.d.ts",
    ],
  },
  {
    files: ["**/*.js", "*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "no-console": ["warn"],
      "import/no-duplicates": ["error"],
    },
  },
  {
    rules: {
      "no-restricted-globals": ["error", "URL", "TextDecoder", "TextEncoder"],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/prefer-readonly": "error",
    },
  },
);

export default opts;
