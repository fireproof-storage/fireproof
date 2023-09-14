import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
import { delegate, Delegation } from '@ucanto/core'
// import { clock } from '@web3-storage/clock/capabilities'

// import * as DID from '@ipld/dag-ucan/did'
import type { Link } from 'multiformats'
import type { Doc, DownloadDataFnParams, DownloadMetaFnParams, IndexRow, MapFn, UploadDataFnParams, UploadMetaFnParams } from './types'
import { validateDataParams } from './connect'
import { Connection } from './connection'
// import { CID } from 'multiformats'
import { EventBlock, EventView, decodeEventBlock } from '@alanshaw/pail/clock'
import { encodeCarFile } from './loader-helpers'
import { MemoryBlockstore } from '@alanshaw/pail/block'
import { Database, fireproof } from './database'
import { Loader } from './loader'
// import { clock } from '@web3-storage/clock/src/capabilities'
// import { Space } from '@web3-storage/w3up-client/dist/src/space'
// import { clock } from '@web3-storage/clock/src/capabilities'

// almost ClockHead, different kind of clock
type CarClockHead = Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[]

type ClockSpaceDoc = Doc & {
  type: 'clock-space';
  clockName: `_clock/${string}/${string}`;
  clockSpace: `did:${string}:${string}`;
  accountSpace: `did:${string}:${string}`;
  issuer: `did:key:${string}`;
  created: number;
  name: string;
  email: `${string}@${string}`;
  ua: string;
  schema: string;
}

type AccessRequestDoc = Doc & {
  type: 'access-request';
  with: `did:${string}:${string}`;
  capabilities: string[];
  grantee: `did:key:${string}`;
  state: 'pending' | 'granted';
  ua: string;
  delegation?: Uint8Array;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type ConnectWeb3Params = { name: string, email: `${string}@${string}`, schema: string }
export class ConnectWeb3 extends Connection {
  params: ConnectWeb3Params
  ready: Promise<void>
  client: Client | null = null
  clockSpaceDID: `did:${string}:${string}` | null = null
  clockProofs: any[] = []

  parents: CarClockHead = []
  eventBlocks = new MemoryBlockstore()
  accountDb: Database | null = null
  accountConnection: ConnectWeb3 | null = null
  inner = false
  loader: Loader | null = null

  accessIndexFn: MapFn = (doc, emit) => {
    const accessDoc = doc as AccessRequestDoc
    if (doc.type === 'access-request') { emit(accessDoc.with + accessDoc.grantee) }
  }

  // requestIndexFn: MapFn = (doc, emit) => {
  //   const accessDoc = doc as AccessRequestDoce
  //   if (doc.type === 'access-request') {
  //     if (doc.state === 'pending') {
  //       emit(accessDoc.audience)
  //     } else if (doc.state === 'granted') {
  //       emit(accessDoc.grantee)
  //     }
  //   }
  // }

  pendingWithIdxFn: MapFn = (doc, emit) => {
    const accessDoc = doc as AccessRequestDoc
    if (doc.type === 'access-request' && doc.state === 'pending') { emit(accessDoc.with) }
  }

  // todo merge this and above into [with, state] index
  // granteeIdxFn: MapFn = (doc, emit) => {
  //   const accessDoc = doc as AccessRequestDoc
  //   if (doc.type === 'access-request' && doc.state === 'granted') { emit(accessDoc.grantee) }
  // }

  ownerIdxFn: MapFn = (doc, emit) => {
    const myDoc = doc as AccessRequestDoc | ClockSpaceDoc
    if (myDoc.type === 'clock-space') {
      emit(myDoc.issuer)
    } else if (myDoc.type === 'access-request' && myDoc.state === 'granted') {
      emit(myDoc.grantee)
    }
  }

  constructor(params: ConnectWeb3Params, _database?: Database) {
    super()
    this.params = params
    if (_database) {
      this.inner = true
      this.accountDb = _database
    }
    this.ready = this.initializeClient()
    this.ready.then(() => {
      void this.serviceAccessRequests()
      void this.startBackgroundSync()
    }).catch(e => {
      console.error('web3 client error', e)
    })
  }

  async initializeClient() {
    if (this.inner) {
      // we are an inner client
      this.client = await this.connectClient(this.params.email)
    } else {
      this.accountDb = fireproof('_connect-web3')
      this.accountConnection = new ConnectWeb3(this.params, this.accountDb)
      const { _crdt: { blocks: { loader } } } = this.accountDb
      loader?.connectRemote(this.accountConnection)
      await this.accountConnection.ready
      await this.accountDb.changes([], { limit: 1 })
      await this.provisionClockSpace()
      console.log('connected clockSpaceDID', this.clockSpaceDIDForDb())
    }
  }

  async clientForDb() {
    await this.ready
    if (this.inner) return this.client!
    await this.accountConnection!.ready
    return this.accountConnection!.client!
  }

  clockProofsForDb() {
    if (this.inner) {
      // await this.ready
      const client = this.client!
      const clockProofs = client.proofs([{ can: 'clock/*', with: this.clockSpaceDIDForDb() }])
      if (!clockProofs.length) { throw new Error('missing clock/* capability on account space') }
      return clockProofs
    }

    if (this.clockProofs.length) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return this.clockProofs
    }

    const client = this.accountConnection!.client!
    const clockProofs = client.proofs([{ can: 'clock/*', with: this.clockSpaceDIDForDb() }])
    if (clockProofs.length) {
      this.clockProofs = clockProofs
    }
    if (!clockProofs.length) { throw new Error('need clock/* capability for ' + this.clockSpaceDIDForDb()) }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.clockProofs
  }

  clockSpaceDIDForDb() {
    if (this.inner) return this.client!.currentSpace()!.did()
    return this.clockSpaceDID!
  }

  async startBackgroundSync() {
    if (this.inner) return
    await sleep(5000) // todo enable websockets on remote clock
    await this.refresh()
    await this.startBackgroundSync()
  }

  // todo move to a model where new account owner devices automatically get delegated access to all databases
  // register a new device, all databases
  // create a new database, all devices get access
  // this will make everything feel faster

  async serviceAccessRequests() {
    if (this.inner) return
    const client = this.accountConnection!.client!
    // @ts-ignore
    const { issuer } = client._agent

    const thisAgentDID = issuer.did()

    const { rows: owned } = await this.accountDb!.query(this.ownerIdxFn, { key: thisAgentDID })

    const spaceDids = owned.map(({ doc }) => doc!.with)

    const { rows } = await this.accountDb!.query(this.pendingWithIdxFn, { keys: spaceDids })

    for (const { doc } of rows) {
      if (!doc) throw new Error('missing access request doc')
      const accessDoc = doc as AccessRequestDoc
      if (accessDoc.state === 'pending') {
        const clockSpace = accessDoc.with
        const clockProofs = client.proofs([{ can: 'clock/*', with: clockSpace }])
        if (clockProofs.length) {
          const delegationParams = {
            issuer,
            lifetimeInSeconds: 60 * 60 * 24 * 365,
            audience: { did: () => accessDoc.grantee },
            capabilities: [{ can: 'clock/*', with: clockSpace }],
            proofs: client.proofs()
          }
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          const delegation = await delegate(delegationParams)

          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          const delegationCarBytes = await delegation.archive()
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (!delegationCarBytes.ok) throw new Error('missing delegationCarBytes')
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          accessDoc.delegation = delegationCarBytes.ok
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
          // if we do this the delegation can be read outside fireproof
          accessDoc._files = { delegation: new File([delegationCarBytes.ok], 'delegation', { type: 'application/ucanto' }) }
          accessDoc.state = 'granted'
          console.log('granting delegation', accessDoc)

          await this.accountDb!.put(accessDoc)
        }
      }
    }
    await sleep(5000) // todo enable websockets on remote clock
    await this.accountConnection!.refresh()
    await this.serviceAccessRequests()
  }

  async waitForAccess(clockSpaceDID: `did:${string}:${string}`, agentDID: `did:key:${string}`) {
    const key = clockSpaceDID + agentDID
    const { rows } = await this.accountDb!.query(this.accessIndexFn, { key })
    if (rows.length) {
      const doc = rows[0].doc as AccessRequestDoc
      if (doc.state === 'granted') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const loadedDelegation = await Delegation.extract(doc.delegation!)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!loadedDelegation.ok) throw new Error('missing loadedDelegation')
        const client = this.accountConnection!.client!
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        // console.log('adding proof', loadedDelegation.ok)
        await client.addProof(loadedDelegation.ok)
        const theseClockProofs = client.proofs([{ can: 'clock/*', with: clockSpaceDID }])
        if (!theseClockProofs.length) { throw new Error('failed granting clock/* capability') }
        console.log('accepting delegation', doc)
        this.clockProofs = theseClockProofs
        return
      } else {
        console.log('waiting for access, please ensure another logged-in tab is open', clockSpaceDID)
      }
    }
    await sleep(3000) // todo enable websockets on remote clock
    await this.accountConnection!.refresh()
    await this.waitForAccess(clockSpaceDID, agentDID)
  }

  async provisionClockSpace() {
    const { rows } = await this.accountDb!.query('clockName', { key: this.encodeSpaceName() })
    const client = this.accountConnection!.client!
    // @ts-ignore
    const thisAgentDID = client._agent.issuer.did()

    if (rows.length) {
      await this.handleExistingSpace(rows, client, thisAgentDID)
    } else {
      await this.handleCreateNewSpace(client)
    }
  }

  async handleExistingSpace(rows: IndexRow[], client: Client, thisAgentDID: `did:key:${string}`) {
    // console.log('existing clock spaces for schema/name', this.encodeSpaceName(), rows)
    const doc = rows[0].doc as ClockSpaceDoc
    const clockSpaceDID = doc.clockSpace
    const proofs = client.proofs([{ can: 'clock/*', with: clockSpaceDID }])

    this.clockSpaceDID = clockSpaceDID

    console.log('joining clock space', clockSpaceDID, proofs.length, doc.email, doc.clockName, rows.length)

    if (!proofs.length) {
      await this.handleRequestAccess(doc, clockSpaceDID, thisAgentDID)
    }
  }

  async handleRequestAccess(doc: ClockSpaceDoc, clockSpaceDID: `did:${string}:${string}`, thisAgentDID: `did:key:${string}`) {
    const key = clockSpaceDID + thisAgentDID
    const { rows } = await this.accountDb!.query(this.accessIndexFn, { key })
    console.log('requesting access', clockSpaceDID, rows.length)
    if (!rows.length) {
      const accessRequestDoc: AccessRequestDoc = {
        type: 'access-request',
        state: 'pending',
        with: clockSpaceDID,
        capabilities: ['clock/*'],
        grantee: thisAgentDID,
        ua: navigator.userAgent
      }
      await this.accountDb!.put(accessRequestDoc)
    }
    await this.waitForAccess(clockSpaceDID, thisAgentDID)
  }

  async handleCreateNewSpace(client: Client) {
    const clockSpace = await client.createSpace(this.encodeSpaceName())
    this.clockSpaceDID = clockSpace.did()
    const doc: ClockSpaceDoc = {
      type: 'clock-space',
      ...this.params,
      clockName: this.encodeSpaceName(),
      clockSpace: this.clockSpaceDID,
      accountSpace: client.currentSpace()!.did(),
      // @ts-ignore
      issuer: client._agent.issuer.did(),
      ua: navigator.userAgent,
      created: Date.now()
    }
    await this.accountDb!.put(doc)
  }

  encodeSpaceName(): `_clock/${string}/${string}` {
    const schemaPart = encodeURIComponent(this.params.schema)
    const namePart = encodeURIComponent(this.params.name)
    return `_clock/${schemaPart}/${namePart}`
  }

  decodeSpaceName(spaceName: `_clock/${string}/${string}`) {
    const [, schemaPart, namePart] = spaceName.split('/')
    const schema = decodeURIComponent(schemaPart)
    const name = decodeURIComponent(namePart)
    return { schema, name }
  }

  async dataDownload(params: DownloadDataFnParams) {
    validateDataParams(params)
    const url = `https://${params.car}.ipfs.w3s.link/`
    const response = await fetch(url)
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer())
    } else {
      throw new Error(`Failed to download ${url}`)
    }
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    const client = await this.clientForDb()
    if (!client) { throw new Error('client not initialized') }
    validateDataParams(params)
    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available via CDN
    // todo if params.type === 'file' and database is public also uploadCAR
    // await client.uploadCAR(new Blob([bytes]))
    return await client.uploadFile(new Blob([bytes]))
  }

  async metaDownload(params: DownloadMetaFnParams) {
    const client = await this.clientForDb()
    // @ts-ignore
    const { issuer } = client._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }
    const clockProofs = this.clockProofsForDb()
    const head = await w3clock.head({
      issuer,
      with: this.clockSpaceDIDForDb(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      proofs: clockProofs
    })
    if (head.out.ok) {
      // fetch that block from the network
      const remoteHead = head.out.ok.head
      return this.fetchAndUpdateHead(remoteHead)
    } else {
      console.log('w3clock error', head.out.error)
      throw new Error(`Failed to download ${params.name}`)
    }
  }

  // bytes is encoded {car, key}, not our job to decode, just return on download
  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    const client = await this.clientForDb()
    // @ts-ignore
    const { issuer } = client._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }

    const clockProofs = this.clockProofsForDb()

    const data = {
      dbMeta: bytes
    }
    const event = await EventBlock.create(data, this.parents)
    const eventBlocks = new MemoryBlockstore()
    await this.eventBlocks.put(event.cid, event.bytes)
    await eventBlocks.put(event.cid, event.bytes)

    const { bytes: carBytes } = await encodeCarFile([event.cid], eventBlocks)

    await client.uploadCAR(new Blob([carBytes]))

    const blocks = []
    for (const { bytes: eventBytes } of this.eventBlocks.entries()) {
      blocks.push(await decodeEventBlock(eventBytes))
    }

    const advanced = await w3clock.advance({
      issuer,
      with: this.clockSpaceDIDForDb(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      proofs: clockProofs
    }, event.cid, { blocks })
    this.parents = [event.cid]
    // @ts-ignore
    const { ok, error } = advanced.root.data?.ocm.out
    if (error) { throw new Error(JSON.stringify(error)) }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const head = ok.head as CarClockHead
    return this.fetchAndUpdateHead(head)
  }

  async fetchAndUpdateHead(remoteHead: CarClockHead) {
    const outBytess = []
    const cache = this.eventBlocks
    // todo, we should only ever fetch these once, and not if they are ones we made
    for (const cid of remoteHead) {
      const local = await cache.get(cid)
      if (local) {
        const event = await decodeEventBlock(local.bytes)
        // @ts-ignore
        outBytess.push(event.value.data.dbMeta as Uint8Array)
      } else {
        const url = `https://${cid.toString()}.ipfs.w3s.link/`
        const response = await fetch(url, { redirect: 'follow' })
        if (response.ok) {
          const metaBlock = new Uint8Array(await response.arrayBuffer())
          await cache.put(cid, metaBlock)
          const event = await decodeEventBlock(metaBlock)
          // @ts-ignore
          outBytess.push(event.value.data.dbMeta as Uint8Array)
        } else {
          throw new Error(`Failed to download ${url}`)
        }
      }
    }
    this.parents = remoteHead
    return outBytess
  }

  async connectClient(email: `${string}@${string}`) {
    const client = await create()
    const proofs = client.proofs()
    if (proofs.length === 0) {
      console.log('emailing', email, client.spaces().length)
      await client.authorize(email, {
        capabilities: [{ can: 'clock/*' },
          { can: 'space/*' }, { can: 'provider/add' },
          { can: 'store/*' }, { can: 'upload/*' }]
      })
    }

    const spaces = client.spaces()
    let space
    for (const s of spaces) {
      space = s
      // console.log('space', s.did(), s.registered(), s.name())
      if (s.registered()) {
        break
      }
    }
    if (space === undefined) {
      space = await client.createSpace('_account')
    }
    await client.setCurrentSpace(space.did())

    if (!space.registered()) {
      await client.registerSpace(email)
    }
    return client
  }
}
