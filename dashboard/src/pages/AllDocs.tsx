import { useParams } from 'react-router-dom'
import { headersForDocs } from '../components/dynamicTableHelpers'
import DynamicTable from '../components/DynamicTable'
// import { Doc, ChangesResponse } from '@fireproof/core'
import { useFireproof } from 'use-fireproof'
import { inspectDb } from '../lib/db'

export function AllDocs() {
  const { dbName } = useParams()
  const { useLiveQuery} = useFireproof(inspectDb(dbName as string))
  const result = useLiveQuery('_id', {}, [{doc: {'Loading...': ''}}])
  const headers = headersForDocs(result.docs)
  return (
    <div className="flex flex-col">
      <h2 className="text-2xl">{dbName} / All documents</h2>
      <DynamicTable dbName={dbName} headers={headers} rows={result.docs} />
    </div>
  )
}
