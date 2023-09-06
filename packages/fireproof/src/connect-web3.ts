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

export class ConnectWeb3 implements Connection {
  email: `${string}@${string}`
  ready: Promise<void>
  client: Client | null = null

  parents: Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[] = [] // almost ClockHead, different kind of clock

  constructor(email: `${string}@${string}`) {
    this.email = email
    this.ready = this.initializeClient()
  }

  async initializeClient() {
    this.client = await getClient(this.email)
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
      const outBytess = []
      for (const cid of remoteHead) {
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
      this.parents = remoteHead
      return outBytess
    } else {
      throw new Error(`Failed to download ${params.name}`)
    }
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
  }
}

export async function getClient(email: `${string}@${string}`) {
  const client = await create()
  const existingSpace = client.currentSpace()
  if (existingSpace?.registered()) {
    const clockx = client.proofs([{ can: 'clock/*', with: existingSpace.did() }])
    if (clockx.length) {
      console.log('already authorized!', existingSpace.did(), clockx, client)
      return client
    }
  }
  console.log('emailing', email, client, client.spaces())
  await client.authorize(email) //, { capabilities: [{ can: 'w3clock/*' }] })
  // await client.capability.access.claim()
  console.log('authorized', client)
  let space = client.currentSpace()
  if (space === undefined) {
    const spaces = client.spaces()
    for (const s of spaces) {
      if (s.registered()) {
        space = s
        console.log('space', space.registered(), space.did(), space.meta())
        break
      }
    }
    if (space === undefined) {
      // @ts-ignore
      space = await client.createSpace('fp')
    }
    await client.setCurrentSpace(space.did())
  }
  if (!space.registered()) {
    console.log('registering space')
    await client.registerSpace(email)
  }
  console.log('space', space.did())
  const clockx = client.proofs([{ can: 'clock/*', with: space.did() }])
  console.log('clockx', clockx)
  return client
}
