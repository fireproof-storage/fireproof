/* eslint-disable @typescript-eslint/no-unsafe-argument */
import assert from 'assert'
import { join } from 'path'
import { promises } from 'fs'

const { mkdir, readdir, rm } = promises

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

export async function resetDirectory(dir, name) {
  await doResetDirectory(dir, name)
  await doResetDirectory(dir, name + '.idx')
}

export async function doResetDirectory(dir, name) {
  const path = join(dir, name)
  await mkdir(path, { recursive: true })

  const files = await readdir(path)

  for (const file of files) {
    await rm(join(path, file), { recursive: false, force: true })
  }
}
