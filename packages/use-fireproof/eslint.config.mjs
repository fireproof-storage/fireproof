import tseslint from "typescript-eslint";

import shared from "../../eslint.shared.mjs";

const opts = tseslint.config(
  ...shared,
);

export default opts;
