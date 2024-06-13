
import { AccountConnectUCAN } from './connect-ucan-account'
import { DatabaseConnectUCAN } from './connect-ucan-helpers'

export type ConnectUCANParams = { name: string, schema: string }

export type ConnectUCANCallbacks = {
  resolve: (clockSpaceDID: `did:${string}:${string}`) => void;
  reject: (reason: string) => void;
}

// ConnectUCAN is a DatabaseConnectUCAN that creates an account database
// and ask it for the authorizedClient
export class ConnectUCAN extends DatabaseConnectUCAN {
  accountConnection: AccountConnectUCAN
  authorized: boolean | null = null
  params: ConnectUCANParams
  clockSpaceDID!: `did:${string}:${string}`
  constructor(params: ConnectUCANParams) {
    super()
    this.accountConnection = new AccountConnectUCAN()
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
    console.log('initializeClient ConnectUCAN')
    await this.accountConnection.ready
    console.log('initializeClient ConnectUCAN ready')
    this.authorized = this.accountConnection.activated
    await this.accountConnection.authorizedClockSpace(this.params)
      .then((clockSpaceDID: `did:${string}:${string}`) => {
        this.clockSpaceDID = clockSpaceDID
        // this.authorizingComplete() // this is called in DatabaseConnectUCAN constructor
        this.activated = true
      }).catch(this.authorizingFailed)
  }
}
