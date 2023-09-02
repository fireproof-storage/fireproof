import { useParams } from 'react-router-dom'
// import { headersForDocs } from '../components/dynamicTableHelpers'
// import DynamicTable from '../components/DynamicTable'
import { Doc, ChangesResponse } from '@fireproof/core'
import { useFireproof } from 'use-fireproof'

export function Database() {
  const { dbName } = useParams()
  const { useLiveQuery } = useFireproof('_dashboard')
  // const {database, useLiveQuery : ulq} = useFireproof(dbName as string)

  const snapshots = useLiveQuery((doc, map) => {
    if (doc.type === 'snapshot') {
      map(doc.name!)
    }
  })
  // const snapshots = useLiveQuery('_id')

  console.log(snapshots)
  const result = snapshots
  return (
    <div className="flex flex-col">
      <h2 className="text-2xl">{dbName}</h2>
      <p>This database is has additional metadata tracked by the dashboard.</p>
      <h3 className="text-xl mt-2">Snapshots</h3>
      <ul>
        {snapshots.docs.map((doc: Doc) => (
          <li key={doc._id}>
            <span>
              Database: <strong>{doc.name}</strong> Snapped at:{' '}
              {new Date(doc.created).toLocaleString()}
            </span>
            <button>Restore</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
