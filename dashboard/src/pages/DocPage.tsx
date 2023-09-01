import { useParams } from "react-router-dom"

export function DocPage() {
  const { dbName, docId } = useParams()
  console.log(dbName, docId)
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-center">Document</h1>
      <p className="text-xl text-center">This is the document page.</p>
      <p className="text-xl text-center">{dbName}</p>
      <p className="text-xl text-center">{docId}</p>
    </div>
  )
}
