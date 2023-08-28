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

  async upload(bytes: Uint8Array, params: UploadFnParams) {
    console.log('awaiting upload', this.client)
    await this.ready
    validateParams(params)
    console.log('uploading', params)
    await this.client?.uploadFile(new Blob([bytes]))
  }

  async download(params: DownloadFnParams) {
    await this.ready
    validateParams(params)
    // const { type, name, car, branch } = params
    // const fetchFromUrl = new URL(`${type}/${name}/${type === 'meta'
    //   ? branch + '.json?cache=' + Math.floor(Math.random() * 1000000)
    //   : car + '.car'}`, this.downloadUrl)
    // const response = await fetch(fetchFromUrl)
    // const bytes = new Uint8Array(await response.arrayBuffer())
    // return bytes
    return new Uint8Array()
  }
}

export async function getClient(email: `${string}@${string}`) {
  const client = await create()
  await client.authorize(email)
  let space = client.currentSpace()
  if (space === undefined) {
    space = await client.createSpace()
    await client.setCurrentSpace(space.did())
    await client.registerSpace(email)
  }
  return client
}
