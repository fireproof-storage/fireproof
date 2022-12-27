import archy from 'archy'
import clc from 'cli-color'
import { ShardFetcher } from './shard.js'

/**
 * @param {import('./shard').ShardLink} root
 * @param {import('./shard').BlockFetcher} blocks
 * @param {import('./shard').ShardLink[]} [highlight]
 */
export async function tree (root, blocks, highlight = []) {
  const shards = new ShardFetcher(blocks)
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
}
