import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
// import { clock } from '@web3-storage/clock/capabilities'

// import * as DID from '@ipld/dag-ucan/did'
import type { Link } from 'multiformats'
import type { Connection, DownloadDataFnParams, DownloadMetaFnParams, UploadDataFnParams, UploadMetaFnParams } from './types'
import { validateDataParams } from './connect'
// import { CID } from 'multiformats'
import { EventBlock, EventView, decodeEventBlock } from '@alanshaw/pail/clock'
import { encodeCarFile } from './loader-helpers'
import { MemoryBlockstore } from '@alanshaw/pail/block'
import { Database, fireproof } from './database'

// almost ClockHead, different kind of clock
type CarClockHead = Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[]

type ConnectWeb3Params = { name: string, email: `${string}@${string}`, schema: string }
export class ConnectWeb3 implements Connection {
  params: ConnectWeb3Params
  ready: Promise<void>
  client: Client | null = null
  parents: CarClockHead = []
  eventBlocks = new MemoryBlockstore()
  accountDb: Database | null = null
  accountConnection: ConnectWeb3 | null = null
  inner = false

  constructor(params: ConnectWeb3Params, _database?: Database) {
    this.params = params
    if (_database) {
      this.inner = true
      this.accountDb = _database
    }
    this.ready = this.initializeClient()
  }

  async initializeClient() {
    if (this.inner) {
      // we are an inner client
      this.client = await this.connectClient(this.params.email)
    } else {
      this.accountDb = fireproof('_connect-web3')
      this.accountConnection = new ConnectWeb3(this.params, this.accountDb)
      const { _crdt: { blocks: { loader } } } = this.accountDb
      loader?.connectRemote(this.accountConnection)
      await this.accountConnection.ready
      const data = await this.accountDb.changes([], { limit: 1 })
      console.log('accountConnection ready, accountDb.changes()', data)
      // now get the clock for the params.name and params.schema
      const allBySchema = await this.accountDb.query('schema', { key: this.params.schema })
      console.log('allBySchema', allBySchema)
    }
  }

  async clientForDb() {
    if (this.inner) return this.client!
    await this.accountConnection!.ready
    return this.accountConnection!.client!
  }

  // encodeSpaceName() {
  //   const schemaPart = encodeURIComponent(this.schema)
  //   const namePart = encodeURIComponent(this.dbName)
  //   return `${schemaPart}/${namePart}`
  // }

  // decodeSpaceName(spaceName: `${string}/${string}`) {
  //   const [schemaPart, namePart] = spaceName.split('/')
  //   const schema = decodeURIComponent(schemaPart)
  //   const name = decodeURIComponent(namePart)
  //   return { schema, name }
  // }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    // console.log('w3 downloading', params.type, params.car)
    const url = `https://${params.car}.ipfs.w3s.link/`
    const response = await fetch(url)
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer())
    } else {
      // console.log('failed to download', url, response)
      throw new Error(`Failed to download ${url}`)
    }
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    await this.ready
    const client = await this.clientForDb()
    if (!client) { throw new Error('client not initialized') }
    // console.log('w3 uploading car', params.car)
    validateDataParams(params)
    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available via CDN
    // todo if params.type === 'file' and database is public also uploadCAR
    // await client.uploadCAR(new Blob([bytes]))
    return await client.uploadFile(new Blob([bytes]))
  }

  async metaDownload(params: DownloadMetaFnParams) {
    await this.ready
    const client = await this.clientForDb()
    // console.log('w3 meta download', params)
    // @ts-ignore
    const { issuer } = client._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }
    const space = client.currentSpace() // use clock space
    if (!space) { throw new Error('space not initialized') }
    const clockProofs = client.proofs([{ can: 'clock/*', with: space.did() }])
    if (!clockProofs.length) { throw new Error('need clock/* capability') }
    const head = await w3clock.head({
      issuer,
      with: space.did(),
      proofs: clockProofs
    })
    if (head.out.ok) {
      // fetch that block from the network
      const remoteHead = head.out.ok.head
      return this.fetchAndUpdateHead(remoteHead)
    } else {
      throw new Error(`Failed to download ${params.name}`)
    }
  }

  async fetchAndUpdateHead(remoteHead: CarClockHead) {
    // console.log('remoteHead', remoteHead.toString())
    const outBytess = []
    const cache = this.eventBlocks
    // todo, we should only ever fetch these once, and not if they are ones we made
    for (const cid of remoteHead) {
      const local = await cache.get(cid)
      if (local) {
        const event = await decodeEventBlock(local.bytes)
        // @ts-ignore
        outBytess.push(event.value.data.dbMeta as Uint8Array)
      } else {
        const url = `https://${cid.toString()}.ipfs.w3s.link/`
        const response = await fetch(url, { redirect: 'follow' })
        if (response.ok) {
          const metaBlock = new Uint8Array(await response.arrayBuffer())
          await cache.put(cid, metaBlock)
          const event = await decodeEventBlock(metaBlock)
          // @ts-ignore
          outBytess.push(event.value.data.dbMeta as Uint8Array)
        } else {
          // console.log('failed to download', url, response)
          throw new Error(`Failed to download ${url}`)
        }
      }
    }
    this.parents = remoteHead
    return outBytess
  }

  // bytes is encoded {car, key}, not our job to decode, just return on download
  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    const client = await this.clientForDb()
    // @ts-ignore
    const { issuer } = client._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }

    const space = client.currentSpace()
    if (!space) { throw new Error('space not initialized') }

    const clockProofs = client.proofs([{ can: 'clock/*', with: space.did() }]) // use clock space
    if (!clockProofs.length) { throw new Error('need clock/* capability') }

    const data = {
      dbMeta: bytes
    }
    const event = await EventBlock.create(data, this.parents)
    const eventBlocks = new MemoryBlockstore()
    await this.eventBlocks.put(event.cid, event.bytes)
    await eventBlocks.put(event.cid, event.bytes)

    const { bytes: carBytes } = await encodeCarFile([event.cid], eventBlocks)

    await client.uploadCAR(new Blob([carBytes]))

    const blocks = []
    for (const { bytes: eventBytes } of this.eventBlocks.entries()) {
      blocks.push(await decodeEventBlock(eventBytes))
    }

    const advanced = await w3clock.advance({
      issuer,
      with: space.did(),
      proofs: clockProofs
    }, event.cid, { blocks })
    this.parents = [event.cid]
    // @ts-ignore
    const { ok, error } = advanced.root.data?.ocm.out
    if (error) { throw new Error(JSON.stringify(error)) }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const head = ok.head as CarClockHead
    return this.fetchAndUpdateHead(head)
  }

  async connectClient(email: `${string}@${string}`) {
    const client = await create()
    const proofs = client.proofs()
    if (proofs.length === 0) {
      console.log('emailing', email, client, client.spaces(), client.proofs())
      await client.authorize(email, {
        capabilities: [{ can: 'clock/*' },
          { can: 'space/*' }, { can: 'provider/add' },
          { can: 'store/*' }, { can: 'upload/*' }]
      })
    }

    const spaces = client.spaces()
    let space
    for (const s of spaces) {
      space = s
      console.log('space', space.registered(), space.did(), space.name())
      if (s.registered()) {
        break
      }
    }
    if (space === undefined) {
      space = await client.createSpace()
    }
    await client.setCurrentSpace(space.did())

    if (!space.registered()) {
      await client.registerSpace(email)
    }
    return client
  }
}
