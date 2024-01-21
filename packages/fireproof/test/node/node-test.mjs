import { fireproof } from '@fireproof/core'

console.log(fireproof)

const db = fireproof("named-db")

const ok = await db.put({ _id: 'test', hello: 'world' })

console.log(ok)

const doc = await db.get('test')

console.log(doc)