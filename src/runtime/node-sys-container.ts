import { type NodeMap, join } from "./sys-container.js";
import type { ObjectEncodingOptions, PathLike } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as url from "url";
import { toArrayBuffer } from "./gateways/file/utils.js";

export async function createNodeSysContainer(): Promise<NodeMap> {
  // const nodePath = "node:path";
  // const nodeOS = "node:os";
  // const nodeURL = "node:url";
  // const nodeFS = "node:fs";
  // const fs = (await import("node:fs")).promises;
  // const assert = "assert";
  // const path = await import("node:path");
  return {
    state: "node",
    ...path,
    // ...(await import("node:os")),
    // ...(await import("node:url")),
    ...os,
    ...url,
    ...fs,
    join,
    stat: fs.stat as NodeMap["stat"],
    readdir: fs.readdir as NodeMap["readdir"],
    readfile: async (path: PathLike, options?: ObjectEncodingOptions): Promise<Uint8Array> => {
      const rs = await fs.readFile(path, options);
      return toArrayBuffer(rs);
    },
    writefile: fs.writeFile as NodeMap["writefile"],
  };
}
