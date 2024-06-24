
import assert from "assert";
import { join, dirname } from "node:path";
import { promises as fs, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { dataDir as dataDirFn } from "../../src/runtime/data-dir.js";

const dataDir = dataDirFn();

export { dataDir };

const { mkdir, readdir, rm, copyFile } = fs;

export { assert };

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const path = join(dir, name);
  await mkdir(path, { recursive: true });

  const files = await readdir(path);

  for (const file of files) {
    await rm(join(path, file), { recursive: true, force: true });
  }
}

// Function to copy a directory
export async function copyDirectory(source: string, destination: string) {
  // Ensure the destination directory exists
  await mkdir(destination, { recursive: true });

  // Read the source directory
  const entries = await readdir(source, { withFileTypes: true });

  // Iterate through each entry in the directory
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);

    if (entry.isDirectory()) {
      // If the entry is a directory, copy it recursively
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      // If the entry is a file, copy it
      await copyFile(sourcePath, destinationPath);
    }
  }
}

export function getDirectoryName(url: string) {
  let path: string;
  try {
    path = fileURLToPath(url);
  } catch (e) {
    path = url;
  }
  if (process && typeof process.cwd === "function") {
    const cwd = process.cwd();
    if (cwd.endsWith('dist/esm')) {
      path = '../../' + path;
    }
  }
  const dir_name = dirname(path);
  return dir_name;
}

export function readImages(directory: string, imagedirectoryname: string, imagenames: string[]) {
  const images: Buffer[] = [];
  const imagesdirectorypath = join(directory, imagedirectoryname);
  imagenames.forEach((image) => {
    const data = readFileSync(join(imagesdirectorypath, image));
    images.push(data);
  });

  return images;
}
