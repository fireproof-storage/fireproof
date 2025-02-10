import { $ } from "zx";
import * as process from "node:process";

function getVersion(version = "refs/tags/v0.0.0-smoke") {
  if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith("refs/tags/v")) {
    version = process.env.GITHUB_REF;
  }
  return version.split("/").slice(-1)[0].replace(/^v/, "");
}

async function main() {
  const gitHead = (await $`git rev-parse --short HEAD`).stdout.trim();
  const dateTick = (await $`date +%s`).stdout.trim();
  // eslint-disable-next-line no-console, no-undef
  console.log(getVersion(`refs/tags/v0.0.0-smoke-${gitHead}-${dateTick}`));
}

main().catch((e) => {
  // eslint-disable-next-line no-console, no-undef
  console.error(e);
  process.exit(1);
});
