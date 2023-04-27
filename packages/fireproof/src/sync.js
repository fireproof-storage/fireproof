import SimplePeer from 'simple-peer'
import { parseCID } from './database.js'
import { blocksToCarBlock, blocksToEncryptedCarBlock } from './valet.js'
import { CarReader } from '@ipld/car'

export class Sync {
  constructor (database, PeerClass = SimplePeer) {
    this.database = database
    this.PeerClass = PeerClass

    this.pushBacklog = new Promise((resolve, reject) => {
      this.pushBacklogResolve = resolve
      this.pushBacklogReject = reject
    })
  }

  async offer () {
    return this.setupPeer(true)
  }

  async accept (base64offer) {
    const offer = JSON.parse(atob(base64offer))
    const p = this.setupPeer(false)
    this.peer.signal(offer)
    return p
  }

  connect (base64accept) {
    const accept = JSON.parse(atob(base64accept))
    this.peer.signal(accept)
  }

  async setupPeer (initiator = false) {
    this.peer = new this.PeerClass({
      initiator,
      trickle: false
    })
    this.peer.on('connect', () => this.startSync())
    this.peer.on('data', (data) => this.gotData(data))
    const p = new Promise((resolve, reject) => {
      this.peer.on('signal', resolve)
      this.peer.on('error', reject)
    })
    return p.then(signal => btoa(JSON.stringify(signal)))
  }

  async backlog () {
    return this.pushBacklog
  }

  async gotData (data) {
    // console.log('got data', this.peer.initiator)
    const reader = await CarReader.fromBytes(data)
    const blz = new Set()
    for await (const block of reader.blocks()) {
      blz.add(block)
    }
    // @ts-ignore
    reader.entries = reader.blocks
    await this.database.blocks.commit({
      entries: () => [...blz],
      get: async cid => await reader.get(cid)
    })
    const roots = await reader.getRoots()
    // console.log('got roots', roots, this.database.clock)
    this.database.applyClock([], roots)
    this.pushBacklogResolve({ ok: true })
  }

  async startSync () {
    // console.log('start sync', this.peer.initiator)

    const carBlock = await Sync.makeCar(this.database, null)
    // console.log('do send')
    this.peer.send(carBlock.bytes)
    this.pushBacklogResolve({ ok: true })
  }

  // get all the cids
  // tell valet to make a file
  static async makeCar (database, key) {
    const allCIDs = await database.allCIDs()
    const blocks = database.blocks

    const rootCIDs = database.clock

    // console.log('makeCar', rootCIDs, allCIDs)

    if (typeof key === 'undefined') {
      key = blocks.valet?.getKeyMaterial()
    }
    if (key) {
      return blocksToEncryptedCarBlock(
        rootCIDs,
        {
          entries: () => allCIDs.map(cid => ({ cid })),
          get: async cid => await blocks.get(cid)
        },
        key
      )
    } else {
      const carBlocks = await Promise.all(
        allCIDs.map(async c => {
          const b = await blocks.get(c)
          if (typeof b.cid === 'string') {
            b.cid = parseCID(b.cid)
          }
          return b
        })
      )
      // console.log('carblock')
      return blocksToCarBlock(rootCIDs, {
        entries: () => carBlocks
      })
    }
  }
}
