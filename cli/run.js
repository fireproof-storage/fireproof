#!/usr/bin/env node

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as process from "process";

function exec(cmd, args, runDirectory) {
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
    console.error(`Failed to start ${cmd}: ${error.message}`);
    process.exit(1);
  });
}

// const idxTsc = process.argv.findIndex(i => i === 'tsc')
const idxRunIdx = process.argv.findIndex((i) => i.endsWith("run.js"));
const runDirectory = path.dirname(process.argv[idxRunIdx]);
// console.log(runDirectory)
// console.log(">>>>", process.argv, idxTsc, runDirectory)
// if (idxTsc > 0) {
//   const fp_tsc = process.env.FP_TSC ? process.env.FP_TSC : "tsgo"
//   const restArgs = process.argv.slice(idxTsc + 1) ?? []
//   console.log(`Using typescript: ${fp_tsc}`) // :${JSON.stringify(restArgs)}`)
//   exec(fp_tsc, restArgs, runDirectory)
// } else {
const mainJs = path.join(runDirectory, "main.js");
if (fs.existsSync(mainJs)) {
  import(mainJs).catch((e) => console.error(e));
} else {
  const restArgv = process.argv.slice(idxRunIdx + 1) ?? [];
  // console.log(">>>>>", restArgv)
  exec("tsx", [path.join(runDirectory, "main.ts"), ...restArgv], runDirectory);
}
// }
