import { useParams } from 'react-router-dom'

export function Sidebar() {
  const { dbName } = useParams()
  return (
    <div className="Sidebar w-1/4 p-4 dark:bg-gray-900 bg-slate-200">
      <ul className="mt-4">
      <li className="mb-2">
          <a href="/databases">All Databases</a>
        </li>
        <li className="mb-2">
          <a href={'/import'}>Import</a>
        </li>

        {dbName && (
          <ul>
            <li className="mb-2">
              <a href={'/db/' + dbName}>
                <code>{dbName}</code>
              </a>
            </li>
            <li className="mb-2">
              <a href={'/all/' + dbName}>All documents</a>
            </li>
            <li className="mb-2">
              <a href={'/doc/' + dbName}>New document</a>
            </li>
            <li className="mb-2">
              <a href={'/changes/' + dbName}>Changes</a>
            </li>
          </ul>
        )}
      </ul>
    </div>
  )
}
