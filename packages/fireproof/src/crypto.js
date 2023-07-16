// @ts-nocheck
import * as codec from './encrypted-block.js'
import {
  create,
  load
} from 'prolly-trees/cid-set'
import { CID } from 'multiformats'
import { encode, decode, create as mfCreate } from 'multiformats/block'
import * as dagcbor from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'

const createBlock = (bytes, cid) => mfCreate({ cid, bytes, hasher, codec })

const encrypt = async function * ({ get, cids, hasher, key, cache, chunker, root }) {
  const set = new Set()
  let eroot
  for (const string of cids) {
    const cid = CID.parse(string)
    let unencrypted = await get(cid)
    if (!unencrypted.cid) {
      unencrypted = { cid, bytes: unencrypted }
    }
    // console.log('unencrypted', unencrypted)
    const block = await encode({ ...await codec.encrypt({ ...unencrypted, key }), codec, hasher })
    // console.log(`encrypting ${string} as ${block.cid}`)
    yield block
    set.add(block.cid.toString())
    if (unencrypted.cid.equals(root)) eroot = block.cid
  }
  if (!eroot) throw new Error('cids does not include root')
  const list = [...set].map(s => CID.parse(s))
  let last
  for await (const node of create({ list, get, cache, chunker, hasher, codec: dagcbor })) {
    const block = await node.block
    yield block
    last = block
  }
  const head = [eroot, last.cid]
  const block = await encode({ value: head, codec: dagcbor, hasher })
  yield block
}

const decrypt = async function * ({ root, get, key, cache, chunker, hasher }) {
  const o = { ...await get(root), codec: dagcbor, hasher }
  const decodedRoot = await decode(o)
  // console.log('decodedRoot', decodedRoot)
  const { value: [eroot, tree] } = decodedRoot
  const rootBlock = await get(eroot) // should I decrypt?
  const cidset = await load({ cid: tree, get, cache, chunker, codec, hasher })
  const { result: nodes } = await cidset.getAllEntries()
  const unwrap = async (eblock) => {
    const { bytes, cid } = await codec.decrypt({ ...eblock, key }).catch(e => {
      // console.log('ekey', e)
      throw new Error('bad key: ' + key.toString('hex'))
    })
    const block = await createBlock(bytes, cid)
    return block
  }
  const promises = []
  for (const { cid } of nodes) {
    if (!rootBlock.cid.equals(cid)) promises.push(get(cid).then(unwrap))
  }
  yield * promises
  yield unwrap(rootBlock)
}

export {
  encrypt,
  decrypt
}
