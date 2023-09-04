/* eslint-disable @typescript-eslint/ban-ts-comment */
import { CID } from 'multiformats'
import { fireproof, connect, Database } from 'use-fireproof'
export async function snapshot(db: Database, name: string) {
  const snap = fireproof(name)
  await snap._crdt.ready
  const snapshot = await snap._crdt.blocks.loader?.metaStore?.load()
  if (snapshot) {
    // const snaps = await db.query((doc, emit) => { if (doc.type === 'snapshot') emit(doc.name) }, { key: name })
    // console.log('snaps', snaps)
    const ok = await db.put({
      type: 'snapshot',
      created: Date.now(),
      name: name,
      // @ts-ignore
      snapshot
    })
    console.log('ok', ok) 
  }
}

export async function ensureNamed(db: Database, name: string) {
  await db.get('db:' + name).catch(() => db.put({ _id: 'db:' + name, type: 'db', added: Date.now() }))
}

export async function restore(dbName: string, { key, car }: { key: string, car: string }) {
  const snap = fireproof(dbName)
  await snap._crdt.blocks.loader?.metaStore?.save({ key, car: CID.parse(car.toString()) })
}

export function inspectDb(dbName: string) {
  if (!dbName) throw new Error('no dbName')
  if (dbName === '_dashboard') throw new Error('are you sure you want to inspect the dashboard?')
  const db = fireproof(dbName)
  // @ts-ignore
  connect.raw(db, {
    upload: () => false, download: async ({ type, car }) => {
      if (type === 'meta') { return false }
      const url = `https://${car}.ipfs.w3s.link/`
      const response = await fetch(url)
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer())
      } else {
        console.log('failed to download', url, response)
        throw new Error(`Failed to download ${url}`)
      }
    }
  })
  return db
}