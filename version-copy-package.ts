import fs from "fs";
import process from "process";
import path from "path";

async function main() {
  const mainPackageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const files = process.argv.slice(2);
  for (const file of files) {
    const destPath = path.join(path.dirname(file), "package.json");
    fs.copyFileSync(path.basename(file), destPath);
    const destPackageJson = JSON.parse(fs.readFileSync(path.basename(file), "utf8"));

    // copy version from package.json
    for (const destDeps of Object.keys(destPackageJson.dependencies)) {
      if (!mainPackageJson.dependencies[destDeps]) {
        console.error(`Dependency ${destDeps} not found in main package.json`);
      } else {
        destPackageJson.dependencies[destDeps] = mainPackageJson.dependencies[destDeps];
      }
    }
    destPackageJson.version = mainPackageJson.version;
    fs.writeFileSync(destPath, JSON.stringify(destPackageJson, null, 2));
    console.log(`Copied ${file} to ${destPath} with version ${destPackageJson.version}`);
  }
}

main().catch(console.error);
