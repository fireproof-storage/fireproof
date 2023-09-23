import type { Link } from 'multiformats'
import { EventView } from '@alanshaw/pail/clock'
import { AbstractConnectIPFS } from './connect-ipfs-helpers'
import { AccountConnectIPFS } from './connect-ipfs-account'

// almost ClockHead, different kind of clock
export type CarClockHead = Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[]

export type ConnectIPFSParams = { name: string, schema: string }

export abstract class DatabaseConnectIPFS extends AbstractConnectIPFS {
  activated: boolean | null = null
  authorizing: Promise<void>
  authorizingComplete!: () => void
  authorizingFailed!: (reason: string) => void
  connecting: Promise<void>

  constructor() {
    super()
    this.authorizing = new Promise<void>((resolve, reject) => {
      this.authorizingComplete = resolve
      this.authorizingFailed = reject
    })
    // defer this.initializeClient() to after constructor
    this.connecting = Promise.resolve().then(() => this.initializeClient())
    void this.connecting.then(() => {
      if (this.activated) {
        this.authorizingComplete()
      }
    })
    void this.authorizing.then(() => {
      // todo set up background sync
      void this.startBackgroundSync()
    })
  }

  async startBackgroundSync() {
    await new Promise(resolve =>
      // todo implement websocket on w3clock
      setTimeout(resolve, 1000))
    await this.refresh()
    await this.startBackgroundSync()
  }

  // should set authorized to true if authorized
  abstract initializeClient(): Promise<void>;

  // this could move upstairs but we want that file to be other stuff
  async clockProofsForDb(): Promise<any[]> {
    const client = await this.authorizedClient()
    const proofSpace = this.clockSpaceDIDForDb()
    const clockProofs = client.proofs([{ can: 'clock/*', with: proofSpace }])
    if (!clockProofs.length) { throw new Error('missing clock/* capability on account space') }
    return clockProofs
  }
}

export type ConnectIPFSCallbacks = {
  resolve: (clockSpaceDID: `did:${string}:${string}`) => void;
  reject: (reason: string) => void;
}

// ConnectIPFS is a DatabaseConnectIPFS that creates an account database
// and ask it for the authorizedClient
export class ConnectIPFS extends DatabaseConnectIPFS {
  accountConnection: AccountConnectIPFS
  authorized: boolean | null = null
  params: ConnectIPFSParams
  clockSpaceDID!: `did:${string}:${string}`
  constructor(params: ConnectIPFSParams) {
    super()
    this.accountConnection = new AccountConnectIPFS()
    this.params = params
  }

  async authorize(email: `${string}@${string}`) {
    return await this.accountConnection.authorize(email)
  }

  async authorizedClient() {
    await this.authorizing
    return this.accountConnection.authorizedClient()
  }

  clockSpaceDIDForDb() {
    return this.clockSpaceDID
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async initializeClient() {
    await this.accountConnection.connecting
    this.authorized = this.accountConnection.activated
    // Q: will this automatically wait to run run until authorized() completes?
    void this.accountConnection.authorizedClockSpace(this.params)
      .then((clockSpaceDID: `did:${string}:${string}`) => {
        this.clockSpaceDID = clockSpaceDID
        this.authorizingComplete()
      }).catch(this.authorizingFailed)
  }
}
