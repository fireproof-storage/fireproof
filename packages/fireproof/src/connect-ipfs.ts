import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'

import { delegate, Delegation } from '@ucanto/core'
import type { Link } from 'multiformats'
import type { Doc, IndexRow, MapFn } from './types'
import { EventView } from '@alanshaw/pail/clock'
import { Database, fireproof } from './database'
import { Loader } from './loader'
import { AbstractConnectIPFS } from './connect-ipfs-helpers'

// almost ClockHead, different kind of clock
export type CarClockHead = Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[]

export type ConnectIPFSParams = { name: string, schema: string }

abstract class DatabaseConnectIPFS extends AbstractConnectIPFS {
  authorized = false
  authorizing: Promise<void>
  authorizingComplete!: () => void
  authorizingFailed!: (reason: string) => void

  constructor() {
    super()
    this.authorizing = new Promise<void>((resolve, reject) => {
      this.authorizingComplete = resolve
      this.authorizingFailed = reject
    })
  }

  // abstract authorizedClientForDb(): Promise<Client>;

  // abstract clockSpaceDIDForDb(): `did:${string}:${string}`;

  // this could move upstairs but we want that file to be other stuff
  async clockProofsForDb(): Promise<any[]> {
    const client = await this.authorizedClientForDb()
    const proofSpace = this.clockSpaceDIDForDb()
    const clockProofs = client.proofs([{ can: 'clock/*', with: proofSpace }])
    if (!clockProofs.length) { throw new Error('missing clock/* capability on account space') }
    return clockProofs
  }
}

// AccountConnectIPFS is a DatabaseConnectIPFS that manages an account
class AccountConnectIPFS extends DatabaseConnectIPFS {
  accountDb: Database
  client: Client | null = null
  connecting: Promise<void>

  constructor() {
    super()
    this.accountDb = fireproof('_connect-web3')
    this.connecting = this.initializeClient()
    void this.connecting.then(() => {
      if (this.authorized) {
        this.authorizingComplete()
      }
    })
  }

  async initializeClient() {
    this.client = await this.connectClient()
  }

  async authorizedClientForDb() {
    await this.authorizing
    return this.client!
  }

  clockSpaceDIDForDb() {
    return this.client!.currentSpace()!.did()
  }

  async connectClient() {
    const client = await create()
    // console.log('connectClient proofs', client.currentSpace()?.did())
    const space = this.bestSpace(client)
    if (!!space && space.registered()) {
      this.authorized = true
      await client.setCurrentSpace(space.did())
    } else {
      this.authorized = false
    }
    // console.log('connectClient authorized', this.authorized)
    return client
  }

  bestSpace(client: Client) {
    const spaces = client.spaces()
    const space = spaces.find(s => s.registered())
    return space
  }
}

// ConnectIPFS is a DatabaseConnectIPFS that creates an account database
// and ask it for the authorizedClientForDb
export class ConnectIPFS extends DatabaseConnectIPFS {
  constructor(params: ConnectIPFSParams) {
    super()
  }

  async initializeClient() {
    this.accountConnection = new AccountConnectIPFS(this.params, this.accountDb)
    if (this.clockSpaceDID) {
      this.accountConnection.clockSpaceDID = this.clockSpaceDID
    }
    const { _crdt: { blocks: { loader: accountDbLoader } } } = this.accountDb
    accountDbLoader?.connectRemote(this.accountConnection)
    await this.accountConnection.ready

    this.authorized = this.accountConnection.authorized
    // console.log('connecting clockSpaceDID', this.clockSpaceDIDForDb(), this.authorized)
  }
}
