import { useParams } from "react-router-dom"

export function Sidebar() {
  const {dbName} = useParams()
  console.log(dbName)
  const title = dbName ? `Sidebar / ${dbName}` : "Sidebar"
  return (<div className="Sidebar w-1/4  p-4">
    <div>{title}</div>
  </div>)
}
