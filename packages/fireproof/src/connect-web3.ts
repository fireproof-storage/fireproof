import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
// import { clock } from '@web3-storage/clock/capabilities'

// import * as DID from '@ipld/dag-ucan/did'
import type { Link } from 'multiformats'
import type { Doc, DownloadDataFnParams, DownloadMetaFnParams, MapFn, UploadDataFnParams, UploadMetaFnParams } from './types'
import { validateDataParams } from './connect'
import { Connection } from './connection'
// import { CID } from 'multiformats'
import { EventBlock, EventView, decodeEventBlock } from '@alanshaw/pail/clock'
import { encodeCarFile } from './loader-helpers'
import { MemoryBlockstore } from '@alanshaw/pail/block'
import { Database, fireproof } from './database'
import { Loader } from './loader'
// import { Space } from '@web3-storage/w3up-client/dist/src/space'
// import { clock } from '@web3-storage/clock/src/capabilities'

// almost ClockHead, different kind of clock
type CarClockHead = Link<EventView<{ dbMeta: Uint8Array; }>, number, number, 1>[]

type ClockSpaceDoc = Doc & {
  clockName: `_clock/${string}/${string}`;
  clockSpace: `did:${string}:${string}`;
  accountSpace: `did:${string}:${string}`;
  issuer: `did:key:${string}`;
  created: number;
  name: string;
  email: `${string}@${string}`;
  schema: string;
}

type AccessRequestDoc = Doc & {
  audience: `did:key:${string}`;
  with: `did:${string}:${string}`;
  capabilities: string[];
  grantee: `did:key:${string}`;
}

type ConnectWeb3Params = { name: string, email: `${string}@${string}`, schema: string }
export class ConnectWeb3 extends Connection {
  params: ConnectWeb3Params
  ready: Promise<void>
  client: Client | null = null
  clockSpaceDID: `did:${string}:${string}` | null = null

  parents: CarClockHead = []
  eventBlocks = new MemoryBlockstore()
  accountDb: Database | null = null
  accountConnection: ConnectWeb3 | null = null
  inner = false
  loader: Loader | null = null

  accessIndexFn: MapFn = (doc, emit) => {
    const accessDoc = doc as AccessRequestDoc
    if (doc.with) { emit(accessDoc.with + accessDoc.grantee) }
  }

  constructor(params: ConnectWeb3Params, _database?: Database) {
    super()
    this.params = params
    if (_database) {
      this.inner = true
      this.accountDb = _database
    }
    this.ready = this.initializeClient()
  }

  async initializeClient() {
    console.log('initializeClient', this.inner, this.params)
    if (this.inner) {
      // we are an inner client
      this.client = await this.connectClient(this.params.email)
    } else {
      this.accountDb = fireproof('_connect-web3')
      this.accountConnection = new ConnectWeb3(this.params, this.accountDb)
      const { _crdt: { blocks: { loader } } } = this.accountDb
      loader?.connectRemote(this.accountConnection)
      await this.accountConnection.ready
      const data = await this.accountDb.changes([], { limit: 1 })
      console.log('accountConnection ready, accountDb.changes()', data)
      await this.provisionClockSpace()
    }
  }

  async clientForDb() {
    await this.ready
    if (this.inner) return this.client!
    await this.accountConnection!.ready
    return this.accountConnection!.client!
  }

  clockSpaceDIDForDb() {
    if (this.inner) return this.client!.currentSpace()!.did()
    return this.clockSpaceDID!
  }

  async waitForAccess(clockSpaceDID: `did:${string}:${string}`, agentDID: `did:key:${string}`) {
    const key = clockSpaceDID + agentDID
    const { rows } = await this.accountDb!.query(this.accessIndexFn, { key })
    if (rows.length) {
      const doc = rows[0].doc as AccessRequestDoc
      if (doc.state === 'granted') {
        console.log('access granted', doc)
        return
      }
    }
    console.log('waiting for access', key, rows)
    await this.accountConnection!.refresh()
  }

  async provisionClockSpace() {
    const { rows } = await this.accountDb!.query('clockName', { key: this.encodeSpaceName() })
    const client = this.accountConnection!.client!
    // @ts-ignore
    const thisAgentDID = client._agent.issuer.did()
    if (rows.length) {
      console.log('existing clock spaces for schema/name', this.encodeSpaceName(), rows)

      const doc = rows[0].doc as ClockSpaceDoc
      const clockSpaceName = doc.clockName
      const clockSpaceDID = doc.clockSpace
      const proofs = client.proofs([{ can: 'clock/*', with: clockSpaceDID }])

      console.log('proofs', clockSpaceDID, clockSpaceName, proofs)

      if (proofs.length) {
        this.clockSpaceDID = clockSpaceDID
      } else {
        // make a request
        const key = clockSpaceDID + thisAgentDID
        const { rows } = await this.accountDb!.query(this.accessIndexFn, { key })

        if (rows.length) {
          console.log('we already requested access', rows[0].doc)
        } else {
        // write a document that the issuer can use to grant access
          const accessRequestDoc = {
            state: 'pending',
            audience: doc.issuer,
            with: clockSpaceDID,
            capabilities: ['clock/*'],
            grantee: thisAgentDID
          }
          console.log('requesting access', accessRequestDoc)
          await this.accountDb!.put(accessRequestDoc)
        }

        console.log('now we wait for access, please refresh original tab to kickoff grant process')
        await this.waitForAccess(clockSpaceDID, thisAgentDID)
      }

      // we could use this to keep local early start from conflicting with remote key
      // reqeust access if needed
    } else {
      // make one and save it back
      const clockSpace = await client.createSpace(this.encodeSpaceName())
      this.clockSpaceDID = clockSpace.did()
      const doc: ClockSpaceDoc = {
        ...this.params,
        clockName: this.encodeSpaceName(),
        clockSpace: this.clockSpaceDID,
        accountSpace: client.currentSpace()!.did(),
        // @ts-ignore
        issuer: client._agent.issuer.did(),
        created: Date.now()
      }
      await this.accountDb!.put(doc)
    }
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
    // console.log('w3 downloading', params.type, params.car)
    const url = `https://${params.car}.ipfs.w3s.link/`
    const response = await fetch(url)
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer())
    } else {
      // console.log('failed to download', url, response)
      throw new Error(`Failed to download ${url}`)
    }
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams) {
    const client = await this.clientForDb()
    if (!client) { throw new Error('client not initialized') }
    // console.log('w3 uploading car', params.car)
    validateDataParams(params)
    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available via CDN
    // todo if params.type === 'file' and database is public also uploadCAR
    // await client.uploadCAR(new Blob([bytes]))
    return await client.uploadFile(new Blob([bytes]))
  }

  async metaDownload(params: DownloadMetaFnParams) {
    const client = await this.clientForDb()
    // console.log('w3 meta download', params)
    // @ts-ignore
    const { issuer } = client._agent
    if (!issuer.signatureAlgorithm) { throw new Error('issuer not valid') }
    if (params.branch !== 'main') { throw new Error('todo, implement space per branch') }
    const clockProofs = client.proofs([{ can: 'clock/*', with: this.clockSpaceDIDForDb() }])
    if (!clockProofs.length) { throw new Error('need clock/* capability') }
    const head = await w3clock.head({
      issuer,
      with: this.clockSpaceDIDForDb(),
      proofs: clockProofs
    })
    if (head.out.ok) {
      // fetch that block from the network
      const remoteHead = head.out.ok.head
      return this.fetchAndUpdateHead(remoteHead)
    } else {
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

    const clockProofs = client.proofs([{ can: 'clock/*', with: this.clockSpaceDIDForDb() }]) // use clock space
    if (!clockProofs.length) { throw new Error('need clock/* capability') }

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
    // console.log('remoteHead', remoteHead.toString())
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
          // console.log('failed to download', url, response)
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
      console.log('emailing', email, client, client.spaces(), client.proofs())
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
      console.log('space', space.registered(), space.did(), space.name())
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
