import SimplePeer from 'simple-peer'
import { parseCID } from './database.js'
import { decodeEventBlock } from './clock.js'
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
  status = 'new'
  constructor (database, PeerClass = SimplePeer) {
    this.database = database
    this.database.blocks.syncs.add(this) // should this happen during setup?
    this.PeerClass = PeerClass
    this.pushBacklog = new Promise((resolve, reject) => {
      this.pushBacklogResolve = resolve
      this.pushBacklogReject = reject
    })
    // this.pushBacklog.then(() => {
    //   // console.log('sync backlog resolved')
    //   this.database.notifyReset()
    // })
  }

  async offer () {
    this.status = 'offering'
    return this.setupPeer(true)
  }

  async accept (base64offer) {
    const offer = JSON.parse(atob(base64offer))
    const p = this.setupPeer(false)
    this.peer.signal(offer)
    this.status = 'accepting'
    return p
  }

  connect (base64accept) {
    const accept = JSON.parse(atob(base64accept))
    this.status = 'connecting'
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
    // console.log('got data', data.toString())
    let reader = null
    try {
      reader = await CarReader.fromBytes(data)
    } catch (e) {
      // console.log('not a car', data.toString())
    }
    if (reader) {
      console.log('got car')
      this.status = 'parking car'
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
        'got blocks!',
        [...blz].map(({ cid }) => cid.toString())
      )
      // @ts-ignore
      reader.entries = reader.blocks
      await this.database.blocks.commit(
        {
          label: 'sync',
          entries: () => [...blz],
          get: async cid => await reader.get(cid),
          lastCid: [...blz][0].cid // doesn't matter
        },
        false
      )
      // first arg could be the roots parents?
      // get the roots parents
      const parents = await Promise.all(
        roots.map(async cid => {
          const rbl = await reader.get(cid)
          if (!rbl) {
            console.log('missing root block', cid.toString(), reader)
            throw new Error('missing root block')
          }
          const block = await decodeEventBlock(rbl.bytes)
          return block.value.parents
        })
      )
      this.database.applyClock(parents.flat(), roots)
      this.database.notifyReset()
      // console.log('after', this.database.clockToJSON())
      this.pushBacklogResolve({ ok: true })
    } else {
      // data is a json string, parse it
      const message = JSON.parse(data.toString())
      // console.log('got message', message)
      if (message.ok) {
        this.status = 'ok'
        this.pushBacklogResolve({ ok: true })
      } else if (message.clock) {
        const reqCidDiff = message
        // this might be a CID diff
        console.log('got diff', reqCidDiff)
        const carBlock = await Sync.makeCar(this.database, null, reqCidDiff.cids)
        if (!carBlock) {
          // we are full synced
          console.log('we are full synced')
          this.status = 'full synced'
          this.peer.send(JSON.stringify({ ok: true }))
          // this.pushBacklogResolve({ ok: true })
        } else {
          console.log('do send diff', carBlock.bytes.length)
          this.status = 'sending diff car'
          this.peer.send(carBlock.bytes)
          console.log('sent diff car')
          // this.pushBacklogResolve({ ok: true })
        }
      }
    }
  }

  destroy () {
    this.database.blocks.syncs.delete(this)
    this.status = 'destroyed'
    this.peer.destroy()
  }

  async sendUpdate (blockstore) {
    if (!this.peer) return
    // console.log('send update from', this.database.instanceId)
    // todo should send updates since last sync
    const newCar = await blocksToCarBlock(blockstore.lastCid, blockstore)
    this.status = 'sending update car'
    this.peer.send(newCar.bytes)
  }

  async startSync () {
    // console.log('start sync', this.peer.initiator)
    const allCIDs = await this.database.allStoredCIDs()
    // console.log('allCIDs', allCIDs)
    const reqCidDiff = {
      clock: this.database.clockToJSON(),
      cids: allCIDs.map(cid => cid.toString())
    }
    // console.log('send diff', reqCidDiff)
    this.status = 'sending cid diff'
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
    // console.log(
    //   'makeCar',
    //   rootCIDs.map(c => c.toString()),
    //   syncCIDs.map(c => c.toString()),
    //   allCIDs.map(c => c.toString())
    // )
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
