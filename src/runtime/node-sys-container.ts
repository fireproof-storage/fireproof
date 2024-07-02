import { type NodeMap, join, saveImport } from "./sys-container.js";

export async function createNodeSysContainer(): Promise<NodeMap> {
  const nodePath = "node:path";
  const nodeOS = "node:os";
  const nodeURL = "node:url";
  const nodeFS = "node:fs";
  const fs = (await saveImport(nodeFS)).promises;
  const assert = "assert";
  const path = await saveImport(nodePath);
  return {
    state: "node",
    ...path,
    ...(await saveImport(nodeOS)),
    ...(await saveImport(nodeURL)),
    ...fs,
    join,
    readdir: fs.readdir as NodeMap["readdir"],
    readfile: fs.readFile as NodeMap["readfile"],
    writefile: fs.writeFile as NodeMap["writefile"],
    assert: (await saveImport(assert)).default,
  };
}
