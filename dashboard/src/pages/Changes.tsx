/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useCallback, useEffect, useState } from 'react'
import DynamicTable from '../components/DynamicTable'

// @ts-ignore
import type { ChangesResponse, Doc } from '@fireproof/core'
import { useParams } from 'react-router-dom'
import { headersForDocs } from '../components/dynamicTableHelpers'
import { inspectDb } from '../lib/db'

export function Changes() {
  const { dbName } = useParams()
  // const {database: db} = useFireproof(dbName)
  const db = inspectDb(dbName as string)
  // @ts-ignore
  window.db = db
  const [changes, setChanges] = useState({ clock: [], rows: [] } as ChangesResponse)

  const refreshRows = useCallback(async () => {
    setChanges(await db.changes())
  }, [db])

  useEffect(
    () =>
      db.subscribe(() => {
        refreshRows()
      }),
    [db, refreshRows]
  )

  const changesDocs = changes.rows.map(({ value }: { value: Doc }) => value)

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold">Recent changes</h1>
      <DynamicTable dbName={dbName} headers={headersForDocs(changesDocs)} rows={changesDocs} />
    </div>
  )
}
