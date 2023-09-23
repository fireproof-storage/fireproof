import { create } from '@web3-storage/w3up-client'
import type { Client } from '@web3-storage/w3up-client'
import { delegate, Delegation } from '@ucanto/core'

import { Database, fireproof } from './database'
import { ConnectIPFSParams, DatabaseConnectIPFS } from './connect-ipfs'
import type { MapFn } from './types'
import { Capabilities } from '@ucanto/interface'

type ClockSpaceDoc = {
  type: 'clock-space';
  clockName: `_clock/${string}/${string}`;
  with: `did:${string}:${string}`;
  accountSpace: `did:${string}:${string}`;
  issuer: `did:key:${string}`;
  created: number;
  name: string;
  email?: `${string}@${string}`;
  ua: string;
  schema: string;
}

type SchemaMemberDoc = {
  type: 'schema-member';
  member: `did:key:${string}`;
  schema: string;
  ua: string;
}

type SpaceDelegationDoc = {
  type: 'member-delegation';
  audience: `did:key:${string}`;
  with: `did:${string}:${string}`;
  schema: string;
  status: 'pending' | 'applied';
  delegation?: Uint8Array;
}

const didKeyIdxFn: MapFn = (doc, emit) => {
  const myDoc = doc as SpaceDelegationDoc | ClockSpaceDoc
  if (myDoc.type === 'clock-space') {
    emit(myDoc.issuer, myDoc.schema)
  } else if (myDoc.type === 'member-delegation' && myDoc.status === 'applied') {
    emit(myDoc.audience, myDoc.schema)
  }
}

// AccountConnectIPFS is a DatabaseConnectIPFS that manages an account
export class AccountConnectIPFS extends DatabaseConnectIPFS {
  accountDb: Database
  client: Client | null = null

  constructor() {
    super()
    this.accountDb = fireproof('_connect-web3')
    const { _crdt: { blocks: { loader: accountDbLoader } } } = this.accountDb
    accountDbLoader?.connectRemote(this)
    void this.authorizing.then(() => {
      void this.serviceAccessRequests()
    })
  }

  async authorize(email: `${string}@${string}`) {
    const client = this.client!
    await client.authorize(email, {
      capabilities: [{ can: 'clock/*' },
        { can: 'space/*' }, { can: 'provider/add' },
        { can: 'store/*' }, { can: 'upload/*' }]
    })
    let space = this.bestSpace(client)
    if (!space) {
      space = await client.createSpace('_account')
    }
    await client.setCurrentSpace(space.did())
    if (!space.registered()) {
      await client.registerSpace(email)
    }
    this.authorizingComplete()
    const { rows } = await this.accountDb.query('accountSpace', { key: space.did() })
    for (const row of rows) {
      const doc = row.doc as ClockSpaceDoc
      if (!doc.email) {
        doc.email = email
        await this.accountDb.put(doc)
      }
    }
  }

  async initializeClient() {
    this.client = await this.connectClient()
  }

  async authorizedClient() {
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
      this.activated = true
      await client.setCurrentSpace(space.did())
    } else {
      this.activated = false
    }
    // console.log('connectClient authorized', this.activated)
    return client
  }

  bestSpace(client: Client) {
    const spaces = client.spaces()
    const space = spaces.find(s => s.registered())
    return space
  }

  encodeSpaceName(params: ConnectIPFSParams): `_clock/${string}/${string}` {
    const schemaPart = encodeURIComponent(params.schema)
    const namePart = encodeURIComponent(params.name)
    return `_clock/${schemaPart}/${namePart}`
  }

  async authorizedClockSpace(params: ConnectIPFSParams): Promise<`did:${string}:${string}`> {
    await this.loaded
    const { rows } = await this.accountDb.query('clockName', { key: this.encodeSpaceName(params) })
    if (rows.length) {
      const doc = rows[0].doc as ClockSpaceDoc
      const clockSpaceDID = doc.with
      if (doc.schema !== params.schema) {
        throw new Error(`clock schema mismatch, expected ${params.schema} got ${doc.schema}`)
      }
      await this.joinExistingSpace(doc)
      return clockSpaceDID
    } else {
      return await this.createNewSpace(params)
    }
  }

  async createNewSpace(params: ConnectIPFSParams) {
    const client = this.client!
    const spaceKey = this.encodeSpaceName(params)
    // console.log('creating new clock space', this.encodeSpaceName())
    const clockSpace = await client.createSpace(spaceKey)

    const doc: ClockSpaceDoc = {
      type: 'clock-space',
      ...params,
      clockName: spaceKey,
      with: clockSpace.did(),
      accountSpace: client.currentSpace()!.did(),
      issuer: this.issuer(client).did(),
      ua: navigator.userAgent,
      created: Date.now()
    }
    await this.accountDb.put(doc)

    // todo this should delegate access to the new space to all
    // agents that have made requests in this schema

    return clockSpace.did()
  }

  async joinExistingSpace(doc: ClockSpaceDoc) {
    const client = this.client!
    const proofs = client.proofs([{ can: 'clock/*', with: doc.with }])
    if (!proofs.length) {
      const agentDID = this.issuer(this.client!).did()
      await this.joinSchema(doc.schema, agentDID)
      await this.waitForAccess(doc, agentDID)
    }
    return doc.with
  }

  async joinSchema(schema: string, agentDID: `did:key:${string}`) {
    const joinDoc: SchemaMemberDoc = {
      type: 'schema-member',
      member: agentDID,
      schema,
      ua: navigator.userAgent
    }
    await this.accountDb.put(joinDoc)
  }

  async waitForAccess(clockDoc: ClockSpaceDoc, agentDID: `did:key:${string}`) {
    let resolve: (value?: unknown) => void = () => { }
    const accessPromise = new Promise((_resolve) => {
      resolve = _resolve
    })

    const myPendingDelegations = await this.accountDb.query((doc, emit) => {
      const accessDoc = doc as SpaceDelegationDoc
      if (doc.type === 'member-delegation' &&
        accessDoc.audience &&
        accessDoc.status === 'pending') {
        emit(accessDoc.audience)
      }
    }, { includeDocs: true })
    const docs = myPendingDelegations.rows.map(row => row.doc as SpaceDelegationDoc)

    let foundMine = false
    for (const doc of docs) {
      await this.applyDelegation(doc)
      doc.status = 'applied'
      await this.accountDb.put(doc)
      if (doc.with === clockDoc.with) {
        foundMine = true
      }
    }

    if (foundMine) {
      resolve()
    } else {
      const unsub = this.accountDb.subscribe(async (docs) => {
        for (const doc of docs) {
          const updateDoc = doc as SpaceDelegationDoc
          if (updateDoc.type === 'member-delegation' &&
            updateDoc.audience === agentDID &&
            updateDoc.status === 'pending') {
            await this.applyDelegation(updateDoc)
            updateDoc.status = 'applied'
            await this.accountDb.put(updateDoc)
            if (updateDoc.with === doc.with) {
              foundMine = true
            }
          }
        }
        if (foundMine) {
          unsub()
          resolve()
        }
      })
    }
    return accessPromise
  }

  async applyDelegation(doc: SpaceDelegationDoc) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const loadedDelegation = await Delegation.extract(doc.delegation!)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!loadedDelegation.ok) throw new Error('missing loadedDelegation')
    const client = this.client!
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    await client.addProof(loadedDelegation.ok)
    const theseClockProofs = client.proofs([{ can: 'clock/*', with: doc.with }])
    if (!theseClockProofs.length) { throw new Error('failed granting clock/* capability') }
    console.log('accepting delegation', doc)
  }

  async serviceAccessRequests() {
    // query for any access requests I can do
    const { rows: owned } = await this.accountDb.query(didKeyIdxFn, { includeDocs: true, key: this.issuer(this.client!).did() })

    const schemas = [...new Set(owned.map(({ value }) => value as string))]

    // get all members of those schemas
    const { rows: members } = await this.accountDb.query((doc, emit) => {
      const myDoc = doc as SchemaMemberDoc
      if (myDoc.type === 'schema-member') {
        emit(myDoc.schema, myDoc.member)
      }
    }, { keys: schemas, includeDocs: true })

    const memberDidSet = new Set(members.map(({ value }) => value as `did:key:${string}`))
    memberDidSet.delete(this.issuer(this.client!).did())

    const memberDidList = [...memberDidSet]

    const { rows: accessible } = await this.accountDb.query(didKeyIdxFn, { includeDocs: true, keys: memberDidList })

    // for my owned spaces, are there any that are not accessible to any members?
    for (const memberDid of memberDidList) {
      for (const ownedSpace of owned) {
        const accessibleSpace = accessible.find(space => space.doc!.with === ownedSpace.doc!.with && space.key === memberDid)
        if (!accessibleSpace) {
          await this.delegateAccess(ownedSpace.doc as ClockSpaceDoc | SpaceDelegationDoc, memberDid)
        }
      }
    }

    const unsub = this.accountDb.subscribe(async (docs) => {
      for (const doc of docs) {
        const updateDoc = doc as SchemaMemberDoc
        if (updateDoc.type === 'schema-member') {
          const memberDid = updateDoc.member
          if (memberDid !== this.issuer(this.client!).did()) {
            const { rows: owned } = await this.accountDb.query(didKeyIdxFn, { includeDocs: true, key: this.issuer(this.client!).did() })
            const { rows: accessible } = await this.accountDb.query(didKeyIdxFn, { includeDocs: true, key: memberDid })
            for (const ownedSpace of owned) {
              const accessibleSpace = accessible.find(space => space.doc!.with === ownedSpace.doc!.with && space.key === memberDid)
              if (!accessibleSpace) {
                await this.delegateAccess(ownedSpace.doc as ClockSpaceDoc | SpaceDelegationDoc, memberDid)
              }
            }
          }
        }
      }
    })
    return unsub
  }

  async delegateAccess(clockDoc: ClockSpaceDoc | SpaceDelegationDoc, memberDid: `did:key:${string}`) {
    // first ensure we have the capability
    const client = this.client!
    const proofs = client.proofs([{ can: 'clock/*', with: clockDoc.with }])
    if (!proofs.length) {
      throw new Error('missing clock/* capability, cannot delegate: ' + clockDoc.with)
    }
    const delegationParams = {
      issuer: this.issuer(client),
      lifetimeInSeconds: 60 * 60 * 24 * 365,
      audience: { did: () => memberDid },
      capabilities: [{ can: 'clock/*', with: clockDoc.with }] as Capabilities,
      proofs: client.proofs() // proofs?
    }
    const delegation = await delegate(delegationParams)
    const delegationCarBytes = await delegation.archive()
    if (!delegationCarBytes.ok) throw new Error('missing delegationCarBytes')
    const accessDoc: SpaceDelegationDoc = {
      type: 'member-delegation',
      audience: memberDid,
      with: clockDoc.with,
      schema: clockDoc.schema,
      status: 'pending',
      delegation: delegationCarBytes.ok
    }
    await this.accountDb.put(accessDoc)
  }
}
