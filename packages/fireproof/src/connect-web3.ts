import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
// import { clock } from '@web3-storage/clock/capabilities'

// import * as DID from '@ipld/dag-ucan/did'
import type { Link } from 'multiformats'
import type { BlockFetcher, Connection, DownloadDataFnParams, DownloadMetaFnParams, UploadDataFnParams, UploadMetaFnParams } from './types'
import { validateDataParams } from './connect'
// import { CID } from 'multiformats'
import { EventBlock, EventView, decodeEventBlock } from '@alanshaw/pail/clock'
import { encodeCarFile } from './loader-helpers'
import { MemoryBlockstore } from '@alanshaw/pail/block'

// almost ClockHead, different kind of clock
type CarClockHead = Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[]

export class ConnectWeb3 implements Connection {
  dbName: string
  email: `${string}@${string}`
  ready: Promise<void>
  client: Client | null = null
  schema: string
  parents: CarClockHead = []

  constructor(dbName: string, email: `${string}@${string}`, schemaName = 'unknown') {
    this.dbName = dbName
    this.email = email
    this.schema = schemaName
    this.ready = this.initializeClient()
  }

  async initializeClient() {
    this.client = await this.getClient(this.email)
  }

  encodeSpaceName() {
    const schemaPart = encodeURIComponent(this.schema)
    const namePart = encodeURIComponent(this.dbName)
    return `${schemaPart}/${namePart}`
  }

  decodeSpaceName(spaceName: `${string}/${string}`) {
    const [schemaPart, namePart] = spaceName.split('/')
    const schema = decodeURIComponent(schemaPart)
    const name = decodeURIComponent(namePart)
    return { schema, name }
  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    console.log('w3 downloading', params.type, params.car)
    const url = `https://${params.car}.ipfs.w3s.link/`
    const response = await fetch(url)
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer())
    } else {
      console.log('failed to download', url, response)
      throw new Error(`Failed to download ${url}`)
    }
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    await this.ready
    if (!this.client) { throw new Error('client not initialized') }
    console.log('w3 uploading car', params)
    validateDataParams(params)
    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available via CDN
    // todo if params.type === 'file' and database is public also uploadCAR
    // await this.client?.uploadCAR(new Blob([bytes]))
    await this.client?.uploadFile(new Blob([bytes]))
  }

  async metaDownload(params: DownloadMetaFnParams) {
    await this.ready
    console.log('w3 meta download', params)
    // @ts-ignore
    const { issuer } = this.client!._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }
    const space = this.client!.currentSpace()
    if (!space) { throw new Error('space not initialized') }
    const clockProofs = this.client!.proofs([{ can: 'clock/*', with: space.did() }])
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

  async fetchAndUpdateHead(remoteHead: CarClockHead, cache?: BlockFetcher) {
    const outBytess = []
    // todo, we should only ever fetch these once, and not if they are ones we made
    for (const cid of remoteHead) {
      const local = cache ? await cache.get(cid) : undefined
      if (local) {
        const event = await decodeEventBlock(local.bytes)
        // @ts-ignore
        outBytess.push(event.value.data.dbMeta as Uint8Array)
      } else {
        const url = `https://${cid.toString()}.ipfs.w3s.link/`
        const response = await fetch(url, { redirect: 'follow' })
        if (response.ok) {
          const metaBlock = new Uint8Array(await response.arrayBuffer())
          const event = await decodeEventBlock(metaBlock)
          // @ts-ignore
          outBytess.push(event.value.data.dbMeta as Uint8Array)
        } else {
          console.log('failed to download', url, response)
          throw new Error(`Failed to download ${url}`)
        }
      }
    }
    this.parents = remoteHead
    return outBytess
  }

  // bytes is encoded {car, key}, not our job to decode, just return on download
  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    // @ts-ignore
    const { issuer } = this.client!._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    console.log('w3 meta upload', params)

    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }

    const space = this.client!.currentSpace()
    if (!space) { throw new Error('space not initialized') }

    const clockProofs = this.client!.proofs([{ can: 'clock/*', with: space.did() }])
    console.log('clockProofs go', clockProofs)
    if (!clockProofs.length) { throw new Error('need clock/* capability') }

    const data = {
      dbMeta: bytes
    }
    const event = await EventBlock.create(data, this.parents)
    const eventBlocks = new MemoryBlockstore()
    await eventBlocks.put(event.cid, event.bytes)

    const { bytes: carBytes } = await encodeCarFile([event.cid], eventBlocks)

    await this.client?.uploadCAR(new Blob([carBytes]))

    const advanced = await w3clock.advance({
      issuer,
      with: space.did(),
      proofs: clockProofs
    }, event.cid, { blocks: [event] })
    this.parents = [event.cid]
    console.log('advanced', advanced.root.data?.ocm.out)
    // @ts-ignore
    const { ok, error } = advanced.root.data?.ocm.out
    if (error) { throw new Error(JSON.stringify(error)) }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const head = ok.head as CarClockHead
    console.log('HEAD', head)
    return this.fetchAndUpdateHead(head, eventBlocks)
  }

  async getClient(email: `${string}@${string}`) {
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
    console.log('existing spaces', client.currentSpace(), spaces)
    let space
    for (const s of spaces) {
      space = s
      console.log('space', space.registered(), space.did(), space.name())
      if (s.registered()) {
        break
      }
    }
    if (space === undefined) {
      // @ts-ignore
      space = await client.createSpace(this.encodeSpaceName())
    }
    await client.setCurrentSpace(space.did())

    if (!space.registered()) {
      console.log('registering space')
      await client.registerSpace(email)
    }
    console.log('rspace', space.registered(), space.did(), space.name())

    const clockx = client.proofs([{ can: 'clock/*', with: space.did() }])
    console.log('clockx', clockx)

    return client
  }
}
