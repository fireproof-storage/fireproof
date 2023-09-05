import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
// import { clock } from '@web3-storage/clock/capabilities'

// import * as DID from '@ipld/dag-ucan/did'

import { Connection, DownloadFnParams, UploadFnParams } from './types'
import { validateParams } from './connect'
// import { CID } from 'multiformats'
import { EventBlock } from '@alanshaw/pail/clock'

export class ConnectWeb3 implements Connection {
  email: `${string}@${string}`
  ready: Promise<void>
  client: Client | null = null

  constructor(email: `${string}@${string}`) {
    this.email = email
    this.ready = this.initializeClient()
  }

  async initializeClient() {
    this.client = await getClient(this.email)
  }

  async download(params: DownloadFnParams) {
    validateParams(params)
    if (params.type === 'meta') {
      return await this.metaDownload(params)
    }
    console.log('w3 downloading', params)
    const url = `https://${params.car}.ipfs.w3s.link/`
    const response = await fetch(url)
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer())
    } else {
      console.log('failed to download', url, response)
      throw new Error(`Failed to download ${url}`)
    }
  }

  async upload(bytes: Uint8Array, params: UploadFnParams) {
    await this.ready
    if (!this.client) { throw new Error('client not initialized') }

    if (params.type === 'meta') {
      // @ts-ignore
      return await this.uploadMeta(bytes, params)
    }

    validateParams(params)
    console.log('w3 uploading car', params)
    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available via CDN
    // todo if params.type === 'file' and database is public also uploadCAR
    // await this.client?.uploadCAR(new Blob([bytes]))
    await this.client?.uploadFile(new Blob([bytes]))
  }

  private async metaDownload(params: DownloadFnParams) {
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
    console.log('head', head, head.out.ok)
    if (head.out.ok) {
      // fetch that block from the network
      const remoteHead = head.out.ok.head
      for (const cid of remoteHead) {
        const url = `https://${cid.toString()}.ipfs.w3s.link/`
        console.log('head', url)
        const response = await fetch(url)
        if (response.ok) {
          const metaBlock = new Uint8Array(await response.arrayBuffer())
          // parse the metablock and call mergeMetaFromRemote with it, then the next etc
        }
      }
    }
    return new Uint8Array()
  }

  // bytes is encoded {car, key}, not our job to decode, just return on download
  private async uploadMeta(bytes: Uint8Array, params: UploadFnParams) {
    // @ts-ignore
    const { issuer } = this.client!._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    console.log('w3 meta upload', params)

    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }

    // use branch and name to lookup the space

    const space = this.client!.currentSpace()
    if (!space) { throw new Error('space not initialized') }

    // we need the upload as an event block or the data that goes in one
    const data = {
      dbMeta: bytes
    }
    const event = await EventBlock.create(data)

    // console.log('DIDs', space.did(), issuer.did())
    const clockProofs = this.client!.proofs([{ can: 'clock/*', with: space.did() }])
    console.log('clockProofs go', clockProofs)
    if (!clockProofs.length) { throw new Error('need clock/* capability') }

    const advanced = await w3clock.advance({
      issuer,
      with: space.did(),
      proofs: clockProofs
    }, event.cid, { blocks: [event] })

    console.log('advanced', advanced.root.data?.ocm)
  }
}

export async function getClient(email: `${string}@${string}`) {
  const client = await create()
  const existingSpace = client.currentSpace()
  if (existingSpace?.registered()) {
    const clockx = client.proofs([{ can: 'clock/*', with: existingSpace.did() }])
    if (clockx.length) {
      console.log('already authorized', clockx)
      return client
    }
  }
  console.log('authorizing', email)
  await client.authorize(email)//, { capabilities: [{ can: 'w3clock/*' }] })
  // await client.capability.access.claim()
  console.log('authorized', client)
  let space = client.currentSpace()

  // console.log('claims', claims)
  if (space === undefined) {
    const spaces = client.spaces()
    for (const s of spaces) {
      if (s.registered()) {
        space = s
        // use
        // space.proofs()
        // client.proofs({ can: 'w3clock/*' })
        // has w3clock?
        console.log('space', space.registered(), space.did(), space.meta())
        break
      }
    }
    if (space === undefined) {
      // @ts-ignore
      space = await client.createSpace('fp')
      // , [{
      //   // @ts-ignore
      //   audience: client._agent.issuer
      //   // audience: DID.parse('did:web:clock.web3.storage')
      // }])
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
