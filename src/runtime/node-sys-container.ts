import type { NodeMap } from "./sys-container.js";
export async function createNodeSysContainer(): Promise<NodeMap> {
  const nodePath = "node:path";
  const nodeOS = "node:os";
  const nodeURL = "node:url";
  const nodeFS = "node:fs";
  const fs = (await import(nodeFS)).promises;
  const assert = "assert";
  return {
    state: "node",
    ...(await import(nodePath)),
    ...(await import(nodeOS)),
    ...(await import(nodeURL)),
    ...fs,
    readdir: fs.readdir as NodeMap["readdir"],
    readfile: fs.readFile as NodeMap["readfile"],
    writefile: fs.writeFile as NodeMap["writefile"],
    assert: (await import(assert)).default,
  };
}
