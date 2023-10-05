/* eslint-disable @typescript-eslint/ban-ts-comment */
import { CID } from 'multiformats'
import { fireproof, Database } from 'use-fireproof'
import { connect } from '@fireproof/connect'
export async function snapshot(db: Database, name: string) {
  const snap = fireproof(name)
  await snap._crdt.ready
  const snapshot = await snap._crdt.blocks.loader?.metaStore?.load()
  if (snapshot) { // .length === 1
    const snaps = await db.query((doc, emit) => { if (doc.type === 'snapshot') emit(doc.name) }, { key: name })
    // @ts-ignore
    if (snaps.rows.some((s) => s.doc.snapshot!.car.toString() === snapshot.car.toString())) {
      return
    }
    await db.put({
      type: 'snapshot',
      created: Date.now(),
      name: name,
      // @ts-ignore
      snapshot
    })
  }
}
// https://sam-app-s3uploadbucket-e6rv1dj2kydh.s3.us-east-2.amazonaws.com/data/fp.fp.thrus1/bafkreiejpc3kl2wasu4nyeozgubulohiqifyt3vu2vcoauzfrnxwc2rrrq.car

export async function ensureNamed(db: Database, name: string) {
  await db.get('db:' + name).catch(() => db.put({ _id: 'db:' + name, type: 'db', added: Date.now() }))
}

export async function restore(dbName: string, { key, car }: { key: string, car: string }) {
  const snap = fireproof(dbName)
  await snap._crdt.blocks.loader?.metaStore?.save({ key, car: CID.parse(car.toString()) })
}

const fetchCarIPFS = async ({ car }: { car: string }) => {
  const url = `https://${car}.ipfs.w3s.link/`
  const response = await fetch(url)
  if (response.ok) {
    return new Uint8Array(await response.arrayBuffer())
  } else {
    // console.log('failed to download', url, response)
    throw new Error(`Failed to download ${url}`)
  }
}

const fetchCarS3 = async ({ car, name }: { car: string, name:string }) => {
  const host = `https://sam-app-s3uploadbucket-e6rv1dj2kydh.s3.us-east-2.amazonaws.com`
  const url = `${host}/data/${name}/${car}.car`
  const response = await fetch(url)
  if (response.ok) {
    return new Uint8Array(await response.arrayBuffer())
  } else {
    // console.log('failed to download', url, response)
    throw new Error(`Failed to download ${url}`)
  }
}

export function inspectDb(dbName: string) {
  if (!dbName) throw new Error('no dbName')
  if (dbName === '_dashboard') throw new Error('are you sure you want to inspect the dashboard database?')
  const db = fireproof(dbName)

  // @ts-ignore
  connect.raw(db, {
    dataUpload: () => false, 
    metaUpload: () => false, 
    metaDownload: () => false, 
    dataDownload: async (params) => {
      const got = await Promise.any([
        fetchCarIPFS(params),
        fetchCarS3(params)
      ]).catch((e) => {
        console.log('failed to download', e)
        throw new Error(`Failed to download ${params.car}`)
      })
      return got
    }
  })
  return db
}