import { SysContainer, assert } from "@fireproof/core/runtime";
import { toCryptoOpts } from "../src/runtime/crypto.js";
import { encodeFile } from "../src/runtime/files";
export { dataDir } from "@fireproof/core/runtime";

export { assert };

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function itSkip(value: string, fn: () => unknown, options?: number) {
  if (typeof xit === "function") {
    xit(value, fn, options);
    return;
  }
  const mit = it as unknown as { skip: (value: string, fn: () => unknown, options?: unknown) => unknown };
  if (mit && typeof mit.skip === "function") {
    mit.skip(value, fn, options);
    return;
  }
  console.warn("itSkip of " + value);
}

export function equals<T>(actual: T, expected: T) {
  assert(actual === expected, `Expected '${actual}' to equal '${expected}'`);
}

export function equalsJSON<T>(actual: T, expected: T) {
  equals(JSON.stringify(actual), JSON.stringify(expected));
}

export function notEquals<T>(actual: T, expected: T) {
  assert(actual !== expected, `Expected '${actual} 'to not equal '${expected}'`);
}
interface ToStringFn {
  toString: () => string;
}
export function matches<TA extends ToStringFn, TB extends ToStringFn>(actual: TA, expected: TB | RegExp) {
  if (expected instanceof RegExp) {
    assert(actual.toString().match(expected), `Expected '${actual}' to match ${expected}`);
  } else {
    assert(actual.toString().match(expected.toString()), `Expected '${actual}' to match ${expected}`);
  }
}

// Function to copy a directory
export async function copyDirectory(source: string, destination: string) {
  // Ensure the destination directory exists
  await SysContainer.mkdir(destination, { recursive: true });

  // Read the source directory
  const entries = await SysContainer.readdirent(source, { withFileTypes: true });

  // Iterate through each entry in the directory
  for (const entry of entries) {
    const sourcePath = SysContainer.join(source, entry.name);
    const destinationPath = SysContainer.join(destination, entry.name);

    if (entry.isDirectory()) {
      // If the entry is a directory, copy it recursively
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      // If the entry is a file, copy it
      await SysContainer.copyFile(sourcePath, destinationPath);
    }
  }
}

export function getDirectoryName(url: string) {
  let path: string;
  try {
    path = SysContainer.fileURLToPath(url);
  } catch (e) {
    path = url;
  }
  if (process && typeof process.cwd === "function") {
    const cwd = process.cwd();
    if (cwd.endsWith("dist/esm")) {
      path = "../../" + path;
    }
  }
  const dir_name = SysContainer.dirname(path);
  return dir_name;
}

async function toFileWithCid(buffer: Uint8Array, name: string, opts: FilePropertyBag): Promise<FileWithCid> {
  return {
    file: new File([new Blob([buffer])], name, opts),
    cid: (await encodeFile(new File([new Blob([buffer])], name, opts))).cid.toString(),
  };
}

export interface FileWithCid {
  file: File;
  cid: string;
}
export async function buildBlobFiles(): Promise<FileWithCid[]> {
  const cp = toCryptoOpts();
  return [
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `image.jpg`, { type: "image/jpeg" }),
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `fireproof.png`, { type: "image/png" }),
  ];
}
