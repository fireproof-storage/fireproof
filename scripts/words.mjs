import fs from 'node:fs'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { ShardBlock, put } from '../index.js'
import { MemoryBlockstore } from '../util.js'

async function randomCID () {
  const bytes = crypto.webcrypto.getRandomValues(new Uint8Array(32))
  const hash = await sha256.digest(bytes)
  return CID.create(1, raw.code, hash)
}

async function main () {
  const data = await fs.promises.readFile('/usr/share/dict/words', 'utf8')
  const words = data.split(/\n/)
  const cids = await Promise.all(words.map(randomCID))
  const blocks = new MemoryBlockstore()
  const rootblk = await ShardBlock.create()
  blocks.putSync(rootblk.cid, rootblk.bytes)

  console.time(`put x${words.length}`)
  /** @type {import('../shard').ShardLink} */
  let root = rootblk.cid
  for (const [i, word] of words.entries()) {
    const res = await put(blocks, root, word, cids[i])
    root = res.root
    for (const b of res.additions) {
      blocks.putSync(b.cid, b.bytes)
    }
    for (const b of res.removals) {
      blocks.deleteSync(b.cid)
    }
    if (i % 1000 === 0) {
      console.log(`${Math.floor(i / words.length * 100)}%`)
    }
  }
  console.timeEnd(`put x${words.length}`)

  // @ts-expect-error
  const { writer, out } = CarWriter.create(root)
  const finishPromise = new Promise(resolve => {
    Readable.from(out).pipe(fs.createWriteStream('./words.car')).on('finish', resolve)
  })

  for (const b of blocks.entries()) {
    await writer.put(b)
  }
  await writer.close()
  await finishPromise
}

main()
