import { useParams } from 'react-router-dom'

export function Database() {
  const { dbName } = useParams()

  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-center">Database</h1>
      <p className="text-xl text-center">This is the database page.</p>
      <p className="text-xl text-center">{dbName}</p>
    </div>
  )
}
