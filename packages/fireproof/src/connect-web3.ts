import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
import { clock } from '@web3-storage/clock/capabilities'

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
    if (params.type === 'meta') { return false }
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
      const ag = this.client._agent
      console.log('w3 meta upload', params)
      // w3clock
      const space = this.client.currentSpace()
      if (!space) { throw new Error('space not initialized') }
      // we need the upload as an event block or the data that goes in one
      const data = {
        key: params.name,
        branch: params.branch,
        name: params.name
        // we could extract this from the input type but it silly to do so
        // key:
        // car:
        //  parse('bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy')
      }
      const event = await EventBlock.create(data)

      const issuer = ag.issuer
      console.log('issuer', issuer, issuer.signatureAlgorithm, issuer.did())

      if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }

      // const claims = await this.client.capability.access.claim()
      // console.log('claims', JSON.stringify(claims))

      console.log('DIDs', space.did(), ag.issuer.did())

      // const delegated = await clock.delegate({
      //   issuer: ag.issuer,
      //   audience: ag.issuer, // DID.parse('did:web:clock.web3.storage'),
      //   with: space.did(),
      //   proofs: claims
      // })

      // console.log('delegated', delegated)

      const clockx = this.client.proofs([{ can: 'clock/*', with: space.did() }])
      console.log('clockx go', clockx)

      const advanced = await w3clock.advance({
        issuer: ag.issuer,
        with: space.did(),
        proofs: clockx
      }, event.cid, { blocks: [event] })

      console.log('advanced', advanced.root.data?.ocm)
      return
    }

    validateParams(params)
    console.log('w3 uploading car', params)
    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available vis CDN

    // await this.client?.uploadCAR(new Blob([bytes]))
    await this.client?.uploadFile(new Blob([bytes]))
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
