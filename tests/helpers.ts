
import { SysContainer, assert } from "@fireproof/core/runtime";

export { dataDir } from "@fireproof/core/runtime";

export { assert };


export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export function itSkip(value: string, fn: () => unknown, options?: number) {
  if (typeof xit === "function") {
    xit(value, fn, options);
  }
  const mit = (it as unknown as { skip: (value: string, fn: () => unknown, options?: unknown) => unknown });
  if (mit && typeof mit.skip === "function") {
    mit.skip(value, fn, options);
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
interface ToStringFn { toString: () => string }
export function matches<TA extends ToStringFn, TB extends ToStringFn>(actual: TA, expected: TB | RegExp) {
  if (expected instanceof RegExp) {
    assert(actual.toString().match(expected), `Expected '${actual}' to match ${expected}`);
  } else {
    assert(actual.toString().match(expected.toString()), `Expected '${actual}' to match ${expected}`);
  }
}

export async function resetDirectory(dir: string, name: string) {
  await doResetDirectory(dir, name);
  await doResetDirectory(dir, name + ".idx");
}

export async function doResetDirectory(dir: string, name: string) {
  const path = SysContainer.join(dir, name);
  await SysContainer.mkdir(path, { recursive: true });

  const files = await SysContainer.readdir(path);

  for (const file of files) {
    await SysContainer.rm(SysContainer.join(path, file), { recursive: true });
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
    if (cwd.endsWith('dist/esm')) {
      path = '../../' + path;
    }
  }
  const dir_name = SysContainer.dirname(path);
  return dir_name;
}

export async function readImages(directory: string, imagedirectoryname: string, imagenames: string[]) {
  const images: Buffer[] = [];
  const imagesdirectorypath = SysContainer.join(directory, imagedirectoryname);
  for (const image of imagenames) {
    const imagepath = SysContainer.join(imagesdirectorypath, image);
    const imagebuffer = await SysContainer.readfile(imagepath);
    images.push(imagebuffer);
  }
  return images;
}
