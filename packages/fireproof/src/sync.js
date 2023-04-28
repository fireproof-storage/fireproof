import SimplePeer from 'simple-peer'
import { parseCID } from './database.js'
import { blocksToCarBlock, blocksToEncryptedCarBlock } from './valet.js'
import { CarReader } from '@ipld/car'

/**
 * @typedef {import('./database.js').Database} Database
 */
export class Sync {
  /**
   * @param {Database} database
   * @param {typeof SimplePeer} [PeerClass]
   * @memberof Sync
   * @static
   */
  constructor (database, PeerClass = SimplePeer) {
    this.database = database
    this.PeerClass = PeerClass
    this.pushBacklog = new Promise((resolve, reject) => {
      this.pushBacklogResolve = resolve
      this.pushBacklogReject = reject
    })
    this.pushBacklog.then(() => {
      console.log('sync backlog resolved')
      this.database.notifyReset()
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
    this.peer.on('data', data => this.gotData(data))
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
    try {
      const reader = await CarReader.fromBytes(data)
      const blz = new Set()
      for await (const block of reader.blocks()) {
        blz.add(block)
      }
      const roots = await reader.getRoots()
      console.log(
        'got car',
        roots.map(c => c.toString()),
        this.database.clock.map(c => c.toString())
      )
      console.log(
        'got blocks',
        [...blz].map(({ cid }) => cid.toString())
      )
      // @ts-ignore
      reader.entries = reader.blocks
      await this.database.blocks.commit({
        entries: () => [...blz],
        get: async cid => await reader.get(cid),
        lastCid: [...blz][0].cid // doesn't matter
      })
      this.database.applyClock([], roots)
      console.log('after', this.database.clockToJSON())
      this.pushBacklogResolve({ ok: true })
    } catch (e) {
      // if e.message matche 'CBOR' we can ignore it
      if (!e.message.match(/CBOR/)) {
        throw e
      }

      // data is a json string, parse it
      const reqCidDiff = JSON.parse(data.toString())
      // this might be a CID diff
      console.log('got diff', reqCidDiff)
      const carBlock = await Sync.makeCar(this.database, null, reqCidDiff.cids)
      if (!carBlock) {
        // we are full synced
        console.log('we are full synced')
        this.pushBacklogResolve({ ok: true })
      } else {
        console.log('do send', carBlock.bytes.length)
        this.peer.send(carBlock.bytes)
        // this.pushBacklogResolve({ ok: true })
      }
    }
  }

  async startSync () {
    console.log('start sync', this.peer.initiator)
    const allCIDs = await this.database.allStoredCIDs()
    const reqCidDiff = {
      clock: this.database.clockToJSON(),
      cids: allCIDs.map(cid => cid.toString())
    }
    this.peer.send(JSON.stringify(reqCidDiff))
  }

  // get all the cids
  // tell valet to make a file
  /**
   * @param {import("./database.js").Database} database
   * @param {string} key
   */
  static async makeCar (database, key, skip = []) {
    const allCIDs = await database.allCIDs()
    const blocks = database.blocks
    const rootCIDs = database.clock

    const syncCIDs = [...new Set([...rootCIDs, ...allCIDs])].filter(cid => !skip.includes(cid.toString()))
    console.log(
      'makeCar',
      rootCIDs.map(c => c.toString()),
      syncCIDs.map(c => c.toString())
    )
    if (syncCIDs.length === 0) {
      return null
    }

    if (typeof key === 'undefined') {
      key = blocks.valet?.getKeyMaterial()
    }
    if (key) {
      return blocksToEncryptedCarBlock(
        rootCIDs,
        {
          entries: () => syncCIDs.map(cid => ({ cid })),
          get: async cid => await blocks.get(cid)
        },
        key
      )
    } else {
      const carBlocks = await Promise.all(
        syncCIDs.map(async c => {
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
