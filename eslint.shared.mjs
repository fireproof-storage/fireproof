import tseslint from "typescript-eslint";

const opts = tseslint.config(
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    name: "fireproof-shared",
    rules: {
      "no-console": ["warn"],
    },
  },
);

export default opts;
