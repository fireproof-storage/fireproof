/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useCallback, useEffect, useState } from 'react'
import DynamicTable from '../components/DynamicTable'
import {
  fireproof
  // , useFireproof
} from 'use-fireproof'
import type { ChangesResponse, Doc } from '@fireproof/core'
import { useParams } from 'react-router-dom'
import { headersForDocs } from '../components/dynamicTableHelpers'

export function Changes() {
  const { dbName } = useParams()
  // const {database: db} = useFireproof(dbName)
  const db = fireproof(dbName as string)
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
      <h2 className="text-2xl">Recent changes</h2>
      <DynamicTable dbName={dbName} headers={headersForDocs(changesDocs)} rows={changesDocs} />
    </div>
  )
}
