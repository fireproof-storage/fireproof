import * as fs from "node:fs/promises";
import * as process from "node:process";

function patch(dep, version) {
  if (!dep) {
    return;
  }
  for (const i of ["@fireproof/core", "use-fireproof"]) {
    if (dep[i]) {
      dep[i] = version;
    }
  }
}

async function main() {
  const args = process.argv.reverse();
  const packageJsonName = args[1];
  const version = args[0];
  // eslint-disable-next-line no-undef, no-console
  console.log(`Update Version in ${packageJsonName} to ${version}`);
  const packageJson = JSON.parse(await fs.readFile(packageJsonName));
  for (const i of ["devDependencies", "dependencies", "peerDependencies"]) {
    patch(packageJson[i], version);
  }
  await fs.writeFile(packageJsonName, JSON.stringify(packageJson, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-undef, no-console
  console.error(e);
  process.exit(1);
});
