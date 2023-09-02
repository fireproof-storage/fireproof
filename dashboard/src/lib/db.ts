/* eslint-disable @typescript-eslint/ban-ts-comment */
import { CID } from 'multiformats'
import { fireproof, Database, DocFragment } from 'use-fireproof'
export async function snapshot(db: Database, name: string) {
  const snap = fireproof(name)
  await snap._crdt.ready
  const snapshot = await snap._crdt.blocks.loader?.metaStore?.load()
  if (snapshot) {
    console.log('snapshot', snapshot)
    await db.put({
      type: 'snapshot',
      created: Date.now(),
      name: name,
      // @ts-ignore
      snapshot
    })
  }
}

export async function ensureNamed(db: Database, name: string) {
  await db.get('db:' + name).catch(() => db.put({ _id:'db:' + name, type: 'db', added: Date.now() }))
}


export async function restore(dbName: string, {key, car}: {key: string, car: string}) {
  const snap = fireproof(dbName)
  console.log('restoring', key, car.toString())
  await snap._crdt.blocks.loader?.metaStore?.save({ key, car: CID.parse(car.toString()) })
}