#!/usr/bin/env node
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import sade from 'sade'
import { CID } from 'multiformats/cid'
import { CarIndexedReader, CarReader, CarWriter } from '@ipld/car'
import clc from 'cli-color'
import archy from 'archy'
import { MaxShardSize, put, ShardBlock, get, del } from './index.js'
import { ShardFetcher } from './shard.js'

const cli = sade('pail')

cli.command('put <key> <value>')
  .describe('Put a value (a CID) for the given key. If the key exists it\'s value is overwritten.')
  .alias('set')
  .option('--max-shard-size', 'Maximum shard size in bytes.', MaxShardSize)
  .action(async (key, value, opts) => {
    const blocks = await openBucket()
    const maxShardSize = opts['max-shard-size'] ?? MaxShardSize
    // @ts-expect-error
    const { root, additions, removals } = await put(blocks, (await blocks.getRoots())[0], key, CID.parse(value), { maxShardSize })
    await updateBucket(blocks, root, { additions, removals })

    console.log('Root:')
    console.log(clc.cyan(`  ${root}`))
    console.log('Additions:')
    additions.forEach(b => console.log(clc.green(`  ${b.cid}`)))
    console.log('Removals:')
    removals.forEach(b => console.log(clc.red(`  ${b.cid}`)))
    await closeBucket(blocks)
  })

cli.command('get <key>')
  .describe('Get the stored value for the given key from the bucket. If the key is not found, `undefined` is returned.')
  .action(async (key) => {
    const blocks = await openBucket()
    // @ts-expect-error
    const value = await get(blocks, (await blocks.getRoots())[0], key)
    if (value) console.log(value.toString())
    await closeBucket(blocks)
  })

cli.command('del <key>')
  .describe('Delete the value for the given key from the bucket. If the key is not found no operation occurs.')
  .alias('delete', 'rm', 'remove')
  .action(async (key) => {
    const blocks = await openBucket()
    // @ts-expect-error
    const { root, additions, removals } = await del(blocks, (await blocks.getRoots())[0], key)
    await updateBucket(blocks, root, { additions, removals })

    console.log('Root:')
    console.log(clc.cyan(`  ${root}`))
    console.log('Additions:')
    additions.forEach(b => console.log(clc.green(`  ${b.cid}`)))
    console.log('Removals:')
    removals.forEach(b => console.log(clc.red(`  ${b.cid}`)))
    await closeBucket(blocks)
  })

cli.command('vis')
  .describe('Visualise the bucket')
  .action(async () => {
    const blocks = await openBucket()
    const root = (await blocks.getRoots())[0]
    // @ts-expect-error
    const shards = new ShardFetcher(blocks)
    // @ts-expect-error
    const rshard = await shards.get(root)

    /** @type {archy.Data} */
    const archyRoot = { label: `${clc.cyan(rshard.cid.toString())} ${rshard.bytes.length + 'b'}`, nodes: [] }

    /** @param {import('./shard').ShardEntry} entry */
    const getData = async ([k, v]) => {
      if (!Array.isArray(v)) {
        return { label: `Key(${clc.magenta(k)})`, nodes: [{ label: `Value(${clc.blue(v)})` }] }
      }
      /** @type {archy.Data} */
      const data = { label: `Key(${clc.magenta(k)})`, nodes: [] }
      if (v[1]) data.nodes?.push({ label: `Value(${clc.blue(v[1])})` })
      const blk = await shards.get(v[0])
      data.nodes?.push({
        label: `Shard(${clc.yellow(v[0])}) ${blk.bytes.length + 'b'}`,
        nodes: await Promise.all(blk.value.map(e => getData(e)))
      })
      return data
    }

    for (const entry of rshard.value) {
      archyRoot.nodes?.push(await getData(entry))
    }

    console.log(archy(archyRoot))
    await closeBucket(blocks)
  })

cli.parse(process.argv)

/** @returns {Promise<import('@ipld/car/api').CarReader>} */
async function openBucket () {
  try {
    return await CarIndexedReader.fromFile('./pail.car')
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error('failed to open bucket', { cause: err })
    const rootblk = await ShardBlock.create()
    const { writer, out } = CarWriter.create(rootblk.cid)
    writer.put(rootblk)
    writer.close()
    return CarReader.fromIterable(out)
  }
}

/** @param {import('@ipld/car/api').CarReader} reader */
async function closeBucket (reader) {
  if (reader instanceof CarIndexedReader) {
    await reader.close()
  }
}

/**
 * @param {import('@ipld/car/api').CarReader} reader
 * @param {import('./shard').ShardLink} root
 * @param {import('.').ShardDiff} diff
 */
async function updateBucket (reader, root, { additions, removals }) {
  // @ts-expect-error
  const { writer, out } = CarWriter.create(root)
  const tmp = path.join(os.tmpdir(), `pail${Date.now()}.car`)

  const finishPromise = new Promise(resolve => {
    Readable.from(out).pipe(fs.createWriteStream(tmp)).on('finish', resolve)
  })

  // put new blocks
  for (const b of additions) {
    await writer.put(b)
  }
  // put old blocks without removals
  for await (const b of reader.blocks()) {
    if (removals.some(r => b.cid.toString() === r.cid.toString())) {
      continue
    }
    await writer.put(b)
  }
  await writer.close()
  await finishPromise

  const old = `./pail.car-${new Date().toISOString()}`
  try {
    await fs.promises.rename('./pail.car', old)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  await fs.promises.rename(tmp, './pail.car')
  try {
    await fs.promises.rm(old)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}
