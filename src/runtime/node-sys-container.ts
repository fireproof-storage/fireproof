import type { NodeMap } from "./sys-container.js";

function toArrayBuffer(buffer: Buffer) {
  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return ab;
}

export async function createNodeSysContainer(): Promise<NodeMap> {
  const nodePath = "node:path";
  const nodeOS = "node:os";
  const nodeURL = "node:url";
  const nodeFS = "node:fs";
  const fs = (await import(nodeFS)).promises;
  const assert = "assert";
  const path = await import(nodePath);
  return {
    state: "node",
    ...path,
    ...(await import(nodeOS)),
    ...(await import(nodeURL)),
    ...fs,
    readdir: fs.readdir as NodeMap["readdir"],
    readfile: fs.readFile as NodeMap["readfile"],
    writefile: fs.writeFile as NodeMap["writefile"],
    assert: (await import(assert)).default,
    deleteDB: async (dir: string, name: string) => {
      const fsdir = path.join(dir, name);
      await fs.mkdir(fsdir, { recursive: true });
      const files = await fs.readdir(fsdir);
      for (const file of files) {
        await fs.rm(path.join(fsdir, file), { recursive: true });
      }
    },
    getDB: async (url: URL, storeName: string, key: string) => {
      // awkward that the directory structure is doubled up
      const dbFile = path.join(url.pathname, path.basename(url.pathname), storeName, key);
      const buffer = await fs.readFile(dbFile);
      return toArrayBuffer(buffer);
    },
  };
}
