import { spawn } from "child_process";
import fs from "node:fs";
const args = process.argv.slice(2);

const testfiles = fs.readdirSync("test");
if (testfiles.length == 0) {
  console.log("No files found to test");
  process.exit(0);
}
let command = "mocha test/*.js";

if (args.length > 0) {
  command += ` --grep '${args.join(" ")}'`;
}

const mocha = spawn(command, { stdio: "inherit", shell: true });

mocha.on("close", (code) => {
  process.exit(code);
});
