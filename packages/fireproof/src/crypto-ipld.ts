import * as codec from './encrypted-block.js'
import * as dagcbor from '@ipld/dag-cbor'
// @ts-ignore
import { create, load } from 'prolly-trees/cid-set'
import { CID } from 'multiformats'
import { encode, decode, create as mfCreate } from 'multiformats/block'
import type { AnyBlock, AnyDecodedBlock, AnyLink } from './types.js'
import type { MultihashHasher, ToString } from 'multiformats'

const encrypt = async function * ({
  get, cids, hasher,
  key, cache, chunker, root
}:
  {
    get: (cid: AnyLink) => Promise<AnyBlock | undefined>,
    key: ArrayBuffer, cids: AnyLink[], hasher: MultihashHasher<number>
    chunker: (bytes: Uint8Array) => AsyncGenerator<Uint8Array>,
    cache: (cid: AnyLink) => Promise<AnyBlock>,
    root: AnyLink
  }): AsyncGenerator<any, void, unknown> {
  const set = new Set<ToString<AnyLink>>()
  let eroot
  for (const cid of cids) {
    const unencrypted = await get(cid)
    if (!unencrypted) throw new Error('missing cid: ' + cid.toString())
    const encrypted = await codec.encrypt({ ...unencrypted, key })
    const block = await encode({ ...encrypted, codec, hasher })
    yield block
    set.add(block.cid.toString())
    if (unencrypted.cid.equals(root)) eroot = block.cid
  }
  if (!eroot) throw new Error('cids does not include root')
  const list = [...set].map(s => CID.parse(s))
  let last
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  for await (const node of create({ list, get, cache, chunker, hasher, codec: dagcbor })) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const block = await node.block as AnyBlock
    yield block
    last = block
  }
  if (!last) throw new Error('missing last block')
  const head = [eroot, last.cid]
  const block = await encode({ value: head, codec: dagcbor, hasher })
  yield block
}

const decrypt = async function * ({ root, get, key, cache, chunker, hasher }: {
  root: AnyLink,
  get: (cid: AnyLink) => Promise<AnyBlock | undefined>,
  key: ArrayBuffer,
  cache: (cid: AnyLink) => Promise<AnyBlock>,
  chunker: (bytes: Uint8Array) => AsyncGenerator<Uint8Array>,
  hasher: MultihashHasher<number>
}): AsyncGenerator<AnyBlock, void, undefined> {
  const getWithDecode = async (cid: AnyLink) => get(cid).then(async (block) => {
    if (!block) return
    const decoded = await decode({ ...block, codec: dagcbor, hasher })
    return decoded
  })
  const getWithDecrypt = async (cid: AnyLink) => get(cid).then(async (block) => {
    if (!block) return
    const decoded = await decode({ ...block, codec, hasher })
    return decoded
  })
  const decodedRoot = await getWithDecode(root)
  if (!decodedRoot) throw new Error('missing root')
  if (!decodedRoot.bytes) throw new Error('missing bytes')
  const { value: [eroot, tree] } = decodedRoot as { value: [AnyLink, AnyLink] }
  const rootBlock = await get(eroot) as AnyDecodedBlock
  if (!rootBlock) throw new Error('missing root block')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const cidset = await load({ cid: tree, get: getWithDecode, cache, chunker, codec, hasher })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const { result: nodes } = await cidset.getAllEntries() as { result: { cid: CID }[] }
  const unwrap = async (eblock: AnyDecodedBlock | undefined) => {
    if (!eblock) throw new Error('missing block')
    if (!eblock.value) { eblock = await decode({ ...eblock, codec, hasher }) as AnyDecodedBlock }
    const { bytes, cid } = await codec.decrypt({ ...eblock, key }).catch(e => {
      throw e
    })
    const block = await mfCreate({ cid, bytes, hasher, codec })
    return block
  }
  const promises = []
  for (const { cid } of nodes) {
    if (!rootBlock.cid.equals(cid)) promises.push(getWithDecrypt(cid).then(unwrap))
  }
  yield * promises
  yield unwrap(rootBlock)
}
export {
  encrypt,
  decrypt
}
