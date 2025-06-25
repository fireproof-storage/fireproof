import { Database, DocWithId, fireproof } from '@fireproof/core'

interface Record {
  id: string;
  type: string;
  createdAt: string;
}

async function findAll(db: Database): Promise<Record[]> {
    const result = await db.query(
      (doc: DocWithId<Record>) => {
        if (doc.type === 'CustomPropertyDefinition' && doc.createdAt && doc._deleted !== true) {
          return doc.createdAt
        }
      },
      { descending: true }
    )
    return result.rows
      .filter(row => row.doc) // Filter out any rows without documents
      .map(row => row.doc as Record)
  }

const numberOfDocs = 100

async function writeSampleData(db: Database): Promise<void> {
  console.log("start puts")
  for (let i = 10; i < numberOfDocs; i++) {
    const record: DocWithId<Record> = {
      _id: `record-${i}`,
      id: `record-${i}`,
      type: 'CustomPropertyDefinition',
      createdAt: new Date().toISOString(),
    };
    await db.put(record);
  }
  console.log("start dels")
  for (let i = 10; i < numberOfDocs; i+= 10) {
    await db.del(`record-${i}`);
  }
}

  
async function main() {
  const db = fireproof('test-db6');

  await writeSampleData(db);

  const all = await db.allDocs<Record>();

  const records = await findAll(db)
  console.log('Found records:', all.rows.length, records.length, all.rows.slice(all.rows.length - 10))
}

main().catch(console.error)