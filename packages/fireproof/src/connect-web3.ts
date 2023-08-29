/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { create, Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'

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
      // @ts-ignore
      const issuer = this.client._agent.issuer
      console.log('issuer', issuer, issuer.signatureAlgorithm, issuer.did())

      if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }

      const advanced = await w3clock.advance({
        issuer,
        with: space.did(),
        proofs: []
      }, event.cid, { blocks: [event] })

      console.log('advanced', advanced)
      return
    }

    validateParams(params)
    console.log('w3 uploading car', params)
    await this.client?.uploadFile(new Blob([bytes]))
  }
}

export async function getClient(email: `${string}@${string}`) {
  const client = await create()
  if (client.currentSpace()?.registered()) {
    return client
  }
  console.log('authorizing', email)
  await client.authorize(email)
  console.log('authorized', client)
  let space = client.currentSpace()
  if (space === undefined) {
    const claims = await client.capability.access.claim()
    console.log('claims', claims)
    const spaces = client.spaces()
    for (const s of spaces) {
      if (s.registered()) {
        space = s
        console.log('space', space.registered(), space.did(), space.meta())
        break
      }
    }
    if (space === undefined) {
      space = await client.createSpace()
    }
    await client.setCurrentSpace(space.did())
  }
  if (!space.registered()) {
    console.log('registering space')
    await client.registerSpace(email)
  }
  console.log('space', space.did())
  return client
}
