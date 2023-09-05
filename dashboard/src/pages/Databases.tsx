/* eslint-disable @typescript-eslint/ban-ts-comment */
// import { Doc } from '@fireproof/core'
import { useFireproof } from 'use-fireproof'
import DynamicTable from '../components/DynamicTable'

export function Databases() {
  const { useDocument, useLiveQuery } = useFireproof('_dashboard')
  const [dbInfo, setDbInfo, saveDbInfo] = useDocument({ type: 'db', added: Date.now() })
  const allDbs = useLiveQuery('type', { key: 'db' })

  const handleDbNameChange = (e: { target: { value: string } }) => {
    const dbName = e.target.value
    setDbInfo({ _id: 'db:' + dbName })
  }

  const createDatabase = () => {
    // Your logic for creating a database goes here
    saveDbInfo()
    setDbInfo(false)
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl mb-4 font-bold">Databases</h1>
      <p>
        This is the list of databases managed by the dashboard. They may not all have copies on this
        local device. <a href="/import">Import a database</a> from an existing app, or by calling{' '}
        <code>db.getDashboardURL()</code> or <code>db.openDashboard()</code> in your application.
      </p>
      <form className="my-4 space-y-4 w-full max-w-md">
        <h2 className="text-xl">Create a new database</h2>
        <div>
          <label htmlFor="dbName" className="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="dbName"
            name="dbName"
            type="text"
            value={dbInfo._id ? dbInfo._id.substring(3) : ''}
            onChange={handleDbNameChange}
            className="mt-1 p-2 w-full border rounded-md"
          />
        </div>
        <button
          type="button"
          onClick={createDatabase}
          className="mt-4 px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600"
        >
          Create
        </button>
      </form>
      <DynamicTable
        dbName="_dashboard"
        headers={['name', 'added']}
        th="name"
        link={['name']}
        hrefFn={(dbName: string) => `/all/${dbName}`}
        rows={allDbs.docs
          // @ts-ignore
          .sort(d => d.added)
          .map(doc => {
            // @ts-ignore
            return { added: new Date(doc.added).toLocaleString(), name: doc._id!.slice(3) }
          })}
      />
    </div>
  )
}
