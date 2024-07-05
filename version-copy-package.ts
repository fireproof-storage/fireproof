import fs from "fs";
import process from "process";
import path from "path";

async function main() {
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  const files = process.argv.slice(2);
  for (const file of files) {
    const destPath = path.join(path.dirname(file), "package.json");
    fs.copyFileSync(path.basename(file), destPath);
    const destPackageJson = JSON.parse(fs.readFileSync(path.basename(file), "utf8"));
    destPackageJson.version = version;
    fs.writeFileSync(destPath, JSON.stringify(destPackageJson, null, 2));
    console.log(`Copied ${file} to ${destPath} with version ${version}`);
  }
}

main().catch(console.error);
