/* eslint-disable @typescript-eslint/no-unsafe-argument */
import assert from 'assert'
import { join,dirname } from 'path'
import { promises as fs,readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const { mkdir, readdir, rm, copyFile } = fs

export { assert }

export function equals(actual, expected) {
  assert(actual === expected, `Expected '${actual}' to equal '${expected}'`)
}

export function equalsJSON(actual, expected) {
  equals(JSON.stringify(actual), JSON.stringify(expected))
}

export function notEquals(actual, expected) {
  assert(actual !== expected, `Expected '${actual} 'to not equal '${expected}'`)
}

export function matches(actual, expected) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  assert(actual.toString().match(expected), `Expected '${actual}' to match ${expected}`)
}

//Function to get the directory name from the file url
export function getDirectoryName(url)
{
  const path=fileURLToPath(url)
  const dir_name=dirname(path);
  return dir_name
}

export async function resetDirectory(dir, name) {
  await doResetDirectory(dir, name)
  await doResetDirectory(dir, name + '.idx')
}

export async function doResetDirectory(dir, name) {
  const path = join(dir, name)
  await mkdir(path, { recursive: true })

  const files = await readdir(path)

  for (const file of files) {
    await rm(join(path, file), { recursive: true, force: true })
  }
}

export function readImages(directory,imagedirectoryname,imagenames)
{
  let images=[]
  const imagesdirectorypath=join(directory,imagedirectoryname)
  imagenames.forEach((image)=>
  {
    const data=readFileSync(join(imagesdirectorypath,image))
    images.push(data)
  })

  return images
}

// Function to copy a directory
export async function copyDirectory(source, destination) {
  // Ensure the destination directory exists
  await mkdir(destination, { recursive: true })

  // Read the source directory
  const entries = await readdir(source, { withFileTypes: true })

  // Iterate through each entry in the directory
  for (const entry of entries) {
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)

    if (entry.isDirectory()) {
      // If the entry is a directory, copy it recursively
      await copyDirectory(sourcePath, destinationPath)
    } else if (entry.isFile()) {
      // If the entry is a file, copy it
      await copyFile(sourcePath, destinationPath)
    }
  }
}
