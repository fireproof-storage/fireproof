import { type NodeMap, join } from "./sys-container.js";

export async function createNodeSysContainer(): Promise<NodeMap> {
  const nodePath = "node:path";
  const nodeOS = "node:os";
  const nodeURL = "node:url";
  const nodeFS = "node:fs";
  const fs = (await import(nodeFS)).promises;
  // const assert = "assert";
  const path = await import(nodePath);
  return {
    state: "node",
    ...path,
    ...(await import(nodeOS)),
    ...(await import(nodeURL)),
    ...fs,
    join,
    stat: fs.stat as NodeMap["stat"],
    readdir: fs.readdir as NodeMap["readdir"],
    readfile: fs.readFile as NodeMap["readfile"],
    writefile: fs.writeFile as NodeMap["writefile"],
  };
}
