#!/usr/bin/env node

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as process from "process";

function exec(cmd, args) {
  // process.env.PATH = `${[
  //   `${runDirectory}`,
  //   path.join(runDirectory, "./node_modules/.bin")
  // ].join(":")}:${process.env.PATH}`
  const tsc = spawn(cmd, args, {
    stdio: "inherit", // inherits stdin, stdout, and stderr
  });

  tsc.on("close", (code) => {
    process.exit(code);
  });

  tsc.on("error", (error) => {
    // eslint-disable-next-line no-console, no-undef
    console.error(`Failed to start ${cmd}: ${error.message}`);
    process.exit(1);
  });
}

// const idxTsc = process.argv.findIndex(i => i === 'tsc')
const idxRunIdx = process.argv.findIndex((i) => i.endsWith("run.js"));
const runDirectory = path.dirname(process.argv[idxRunIdx]);
const mainPublishedJs = path.join(runDirectory, "main.js");
const mainWithDistJs = path.join(runDirectory, "dist", "npm", "main.js");
const mainJs = fs.existsSync(mainPublishedJs) ? mainPublishedJs : fs.existsSync(mainWithDistJs) ? mainWithDistJs : undefined;
if (mainJs) {
  // make windows happy file://
  const addFile = `file://${mainJs}`;
  // eslint-disable-next-line no-console, no-undef
  import(addFile).catch((e) => console.error(e));
} else {
  const restArgv = process.argv.slice(idxRunIdx + 1) ?? [];
  // console.log(">>>>>", restArgv)
  exec("tsx", [path.join(runDirectory, "main.ts"), ...restArgv], runDirectory);
}
// }
