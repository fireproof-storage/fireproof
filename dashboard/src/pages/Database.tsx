/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams } from 'react-router-dom'
// import { headersForDocs } from '../components/dynamicTableHelpers'
// import DynamicTable from '../components/DynamicTable'
import { Doc, ChangesResponse } from '@fireproof/core'
import { fireproof, useFireproof } from 'use-fireproof'
import { CID } from 'multiformats'
import { restore, snapshot } from '../lib/db'

export function Database() {
  const { dbName } = useParams()
  const { database: dashDb, useLiveQuery } = useFireproof('_dashboard')
  // const {database, useLiveQuery : ulq} = useFireproof(dbName as string)

  const snapshots = useLiveQuery((doc, map) => {
    if (doc.type === 'snapshot') {
      map(doc.name!)
    }
  })

  const doRestore =
    ({ snapshot: { key, car } }: { snapshot: { key: string; car: string } }) =>
    async () => {
      console.log('restoring', key, car)
      await snapshot(dashDb, dbName!)

      await restore(dbName!, { key, car })
    }

  console.log(snapshots)
  return (
    <div className="flex flex-col">
      <h2 className="text-2xl">{dbName}</h2>
      <p>This database is has additional metadata tracked by the dashboard.</p>
      <h3 className="text-xl mt-2">Snapshots</h3>
      <ul>
        {snapshots.docs.map((doc: any) => (
          <li key={doc._id}>
            <span>
              Database: <strong>{doc.name}</strong> Snapped at:{' '}
              {new Date(doc.created).toLocaleString()}
            </span>
            <button onClick={doRestore(doc)}>Restore</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
