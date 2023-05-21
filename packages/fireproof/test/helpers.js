import crypto from 'node:crypto'
// import assert from 'node:assert'
import * as Link from 'multiformats/link'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { MemoryBlockstore } from './block.js'
import { Loader } from '../src/loader.js'

import { join } from 'path'
import { rmSync, readdirSync } from 'node:fs'
// import { resolve } from 'node:path'
// import * as codec from '@ipld/dag-cbor'

import { mkdir } from 'fs/promises'

export const dbFiles = async (storage, name) => {
  const dbPath = join(storage.config.dataDir, name)
  await mkdir(dbPath, { recursive: true })
  const files = readdirSync(dbPath)
  return files
}

export function resetTestDataDir (name) {
  // fs.rmdirSync(testDataDir, { recursive: true })
  // fs.mkdirSync(testDataDir, { recursive: true })

  const storage = Loader.appropriate('helloName')

  const files = readdirSync(storage.config.dataDir)

  if (name) {
    console.log('removing', name)
    rmSync(join(storage.config.dataDir, name), { recursive: true, force: true })
  } else {
    for (const file of files) {
      if (file.match(/fptest/)) {
        console.log('removing', file)
        rmSync(join(storage.config.dataDir, file), { recursive: true, force: true })
      }
    }
  }
}

// console.x = console.log
// console.log = function (...args) {
//   // window.mutedLog = window.mutedLog || []
//   // window.mutedLog.push(args)
// }

/** @param {number} size */
export async function randomCID (size) {
  const hash = await sha256.digest(await randomBytes(size))
  return Link.create(raw.code, hash)
}

/** @param {number} size */
export async function randomBytes (size) {
  const bytes = new Uint8Array(size)
  while (size) {
    const chunk = new Uint8Array(Math.min(size, 65_536))
    crypto.getRandomValues(chunk)
    size -= bytes.length
    bytes.set(chunk, size)
  }
  return bytes
}

export class Blockstore extends MemoryBlockstore {

}

let seq = 0
export function seqEventData (tag = '') {
  return {
    type: 'put',
    value: `event${seq++}${tag}`
  }
}
export function setSeq (n) {
  seq = n
}
