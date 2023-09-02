import { Doc } from '@fireproof/core'
import { useFireproof } from 'use-fireproof'

export function Databases() {
  const { useDocument, useLiveQuery } = useFireproof('_dashboard')
  const [dbInfo, setDbInfo, saveDbInfo] = useDocument({ type: 'db', added: Date.now() })
  const allDbs = useLiveQuery('type', { key: 'db' })

  const handleDbNameChange = e => {
    const dbName = e.target.value
    setDbInfo({ _id: 'db:' + dbName })
  }

  const createDatabase = () => {
    // Your logic for creating a database goes here
    saveDbInfo()
    setDbInfo(false)
  }

  console.log(allDbs.docs)

  return (
    <div className="flex flex-col">
      <h1 className="text-4xl font-bold">Databases</h1>
      <p className="text-xl">This is the databases page.</p>

      {/* Create Database Form */}
      <form className="mt-4 space-y-4 w-full max-w-md">
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
      <ul className="mt-4">
        {allDbs.docs.map((db: Doc) => (
          <li key={db._id}><a href={`/db/${db._id!.slice(3)}`}>{db._id!.slice(3)}</a></li>
        ))}
      </ul>
    </div>
  )
}
