import fs from "fs";
import process from "process";
import path from "path";

async function main() {
  const files = process.argv.slice(2);
  for (const file of files) {
    const destPath = path.join(path.dirname(file), "package.json");
    // fs.copyFileSync(path.basename(file), destPath);
    const destPackageJson = JSON.parse(fs.readFileSync(destPath, "utf8"));

    destPackageJson.dependencies["@fireproof/core"] = destPackageJson.version;

    fs.writeFileSync(destPath, JSON.stringify(destPackageJson, null, 2));
    console.log(`Updated ${file} at ${destPath} with version ${destPackageJson.version}`);
  }
}

main().catch(console.error);
