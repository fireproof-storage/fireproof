import { useParams } from 'react-router-dom'

export function Sidebar() {
  const { dbName } = useParams()
  const title = dbName ? `Database` : 'Databases'
  return (
    <div className="Sidebar w-1/4  p-4">
      <ul className="mt-4">
        <li className="mb-2">
          <a href="/databases">{title}</a>
          {dbName && (
            <>
              {' '}
              / <a href={'/db/' + dbName}><code>{dbName}</code></a>
            </>
          )}
        </li>
      </ul>
    </div>
  )
}
