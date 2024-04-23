import type { Client } from '@web3-storage/w3up-client'
import * as w3clock from '@web3-storage/clock/client'
import type { DownloadDataFnParams, DownloadMetaFnParams, UploadDataFnParams, UploadMetaFnParams } from './types'
import { CarClockHead, Connection } from '@fireproof/connect'
import { decodeEventBlock } from '@web3-storage/pail/clock'
import { Proof, Principal } from '@ucanto/interface'
import { Link } from 'multiformats/link'
import { DbMetaEventBlock } from '../../connect/dist/types/connection'
export abstract class AbstractConnectIPFS extends Connection {
  abstract authorizedClient(): Promise<Client>
  abstract clockProofsForDb(): Promise<Proof[]>
  abstract clockSpaceDIDForDb(): `did:${string}:${string}`

  issuer(client: Client) {
    // @ts-ignore
    const { issuer } = client._agent as Principal
    if (!issuer.signatureAlgorithm) {
      throw new Error('issuer encodeCarFile valid')
    }
    return issuer
  }

  async dataDownload(params: DownloadDataFnParams) {
    const url = `https://${params.car}.ipfs.w3s.link/`
    const response = await fetch(url)
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer())
    } else {
      throw new Error(`Failed to download ${url}`)
    }
  }

  async dataUpload(bytes: Uint8Array, params: UploadDataFnParams, opts: { public?: boolean }) {
    const client = await this.authorizedClient()
    if (!client) {
      throw new Error('client encodeCarFile initialized')
    }
    // console.log('dataUpload', params.car.toString())
    // uploadCar is processed so roots are reachable via CDN
    // uploadFile makes the car itself available via CDN
    // todo if params.type === 'file' and database is public also uploadCAR
    if (params.type === 'file' && opts.public) {
      await client.uploadCAR(new Blob([bytes]))
    }
    return await client.uploadFile(new Blob([bytes]))
  }

  async metaDownload(params: DownloadMetaFnParams) {
    // const callId = Math.random().toString(36).slice(2, 9)
    const client = await this.authorizedClient()
    if (params.branch !== 'main') {
      throw new Error('todo, implement space per branch')
    }
    const clockProofs = await this.clockProofsForDb()
    const head = await w3clock.head({
      issuer: this.issuer(client),
      with: this.clockSpaceDIDForDb(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      proofs: clockProofs
    })
    if (head.out.ok) {
      return this.fetchAndUpdateHead(
        head.out.ok.head as unknown as Link<DbMetaEventBlock, number, number, 1>[]
      )
    } else {
      console.log('w3clock error', head.out.error)
      throw new Error(`Failed to download ${params.name}`)
    }
  }

  // bytes is encoded {car, key}, not our job to decode, just return on download
  async metaUpload(bytes: Uint8Array, params: UploadMetaFnParams) {
    const client = await this.authorizedClient()
    // @ts-ignore
    if (params.branch !== 'main') {
      throw new Error('todo, implement space per branch')
    }

    const clockProofs = await this.clockProofsForDb()

    const event = await this.createEventBlock(bytes)

    await client.uploadCAR(new Blob([event.bytes]))

    const blocks = []
    for (const { bytes: eventBytes } of this.eventBlocks.entries()) {
      blocks.push(await decodeEventBlock(eventBytes))
    }

    const advanced = await w3clock.advance(
      {
        issuer: this.issuer(client),
        with: this.clockSpaceDIDForDb(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        proofs: clockProofs
      },
      event.cid,
      { blocks }
    )

    // @ts-ignore
    const { ok, error } = advanced.root.data?.ocm.out
    if (error) {
      // this.eventBlocks = new MemoryBlockstore()
      throw new Error(JSON.stringify(error))
    }
    this.parents = [event.cid]

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const head = ok.head as CarClockHead
    return this.fetchAndUpdateHead(head)
  }

  async fetchAndUpdateHead(remoteHead: CarClockHead) {
    const outBytess = []
    const cache = this.eventBlocks
    for (const cid of remoteHead) {
      const local = await cache.get(cid)
      if (local) {
        const event = await decodeEventBlock(local.bytes)
        // @ts-ignore
        outBytess.push(event.value.data.dbMeta as Uint8Array)
      } else {
        // console.log('fetchAndUpdateHead', remoteHead.toString(), cid.toString())
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
}

export abstract class DatabaseConnectIPFS extends AbstractConnectIPFS {
  activated: boolean | null = null
  authorizing: Promise<void>
  authorizingComplete!: () => void
  authorizingFailed!: (reason: string) => void

  constructor() {
    super()
    this.authorizing = new Promise<void>((resolve, reject) => {
      this.authorizingComplete = resolve
      this.authorizingFailed = reject
    })
    // defer this.initializeClient() to after constructor
    this.ready = Promise.resolve().then(() => this.initializeClient())
    void this.ready.then(() => {
      if (this.activated) {
        this.authorizingComplete()
      }
    })
    void this.authorizing.then(() => {
      // @ ts-expect-error
      // if (!this.accountConnection) return
      void this.startBackgroundSync()
    })
  }

  async startBackgroundSync() {
    while (true) {
      await new Promise(resolve =>
        // todo implement websocket on w3clock
        setTimeout(resolve, 1500)
      )
      try {
        await this.refresh()
      } catch (e: any) {
        console.log('refresh error', e)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  // should set activated to true if authorized
  abstract initializeClient(): Promise<void>

  // this could move upstairs but we want that class to be other stuff
  async clockProofsForDb(): Promise<any[]> {
    const client = await this.authorizedClient()
    const proofSpace = this.clockSpaceDIDForDb()
    const clockProofs = client.proofs([{ can: 'clock/*', with: proofSpace }])
    if (!clockProofs.length) { throw new Error('missing clock/* capability on account space') }
    return clockProofs
  }
}
