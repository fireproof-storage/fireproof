
import { AccountConnectIPFS } from './connect-ucan-account'
import { DatabaseConnectIPFS } from './connect-ucan-helpers'

export type ConnectIPFSParams = { name: string, schema: string }

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
    // this fires the accountConnection.authorizing promise
    // which is used to wait for the authorizedClockSpace
    return await this.accountConnection.authorize(email)
  }

  async accountEmail() {
    return await this.accountConnection.accountEmail()
  }

  async authorizedClient() {
    await this.authorizing
    return this.accountConnection.authorizedClient()
  }

  clockSpaceDIDForDb() {
    return this.clockSpaceDID
  }

  async initializeClient() {
    console.log('initializeClient ConnectIPFS')
    await this.accountConnection.ready
    console.log('initializeClient ConnectIPFS ready')
    this.authorized = this.accountConnection.activated
    await this.accountConnection.authorizedClockSpace(this.params)
      .then((clockSpaceDID: `did:${string}:${string}`) => {
        this.clockSpaceDID = clockSpaceDID
        // this.authorizingComplete() // this is called in DatabaseConnectIPFS constructor
        this.activated = true
      }).catch(this.authorizingFailed)
  }
}
