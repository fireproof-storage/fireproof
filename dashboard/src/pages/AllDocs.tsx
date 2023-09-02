import { useParams } from 'react-router-dom'
import { headersForDocs } from '../components/dynamicTableHelpers'
import DynamicTable from '../components/DynamicTable'
// import { Doc, ChangesResponse } from '@fireproof/core'
import { useFireproof } from 'use-fireproof'

export function AllDocs() {
  const { dbName } = useParams()
  const { useLiveQuery} = useFireproof(dbName as string)
  // window.db = database

  const result = useLiveQuery('_id')
  // console.log(result)
  return (
    <div className="flex flex-col">
      <h2 className="text-2xl">{dbName} / All documents</h2>
      <DynamicTable dbName={dbName} headers={headersForDocs(result.docs)} rows={result.docs} />
    </div>
  )
}
