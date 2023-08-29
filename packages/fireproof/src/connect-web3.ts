/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { create, Client } from '@web3-storage/w3up-client'

import { Connection, DownloadFnParams, UploadFnParams } from './types'
import { validateParams } from './connect'

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
    validateParams(params)
    console.log('w3 uploading', params)
    await this.client?.uploadFile(new Blob([bytes]))
  }
}

export async function getClient(email: `${string}@${string}`) {
  const client = await create()
  console.log('authorizing', email)
  await client.authorize(email)
  console.log('authorized', client)
  const claims = await client.capability.access.claim()
  // console.log('claims', claims)
  const spaces = client.spaces()
  let space
  for (const s of spaces) {
    if (s.registered()) {
      space = s
      console.log('space', space.registered(), space.did(), space.meta())
      break
    }
  }
  // let space = client.currentSpace()
  if (space === undefined) {
    space = await client.createSpace()
  }
  await client.setCurrentSpace(space.did())
  if (!space.registered()) {
    await client.registerSpace(email)
  }
  console.log('space', space.did())
  return client
}
