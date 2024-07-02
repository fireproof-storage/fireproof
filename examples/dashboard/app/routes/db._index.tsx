import { Link } from "react-router-dom";

const databases = ["db1", "db2", "db3"]; // Replace with your actual database list

import { Sidebar } from "~/components/Sidebar";

export default function DatabaseIndex() {
  return (
    <div className="flex">
      <div className="w-56">
        <Sidebar />
      </div>
      <div className="flex-1 p-4">
        <DatabaseList />
      </div>
    </div>
  );
}

function DatabaseList() {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Available Databases</h2>
      <p className="mb-4">This is the index page for the /db route.</p>
      <ul>
        {databases.map((db) => (
          <li key={db} className="mb-2">
            <Link to={`/db/${db}`} className="text-blue-500 underline">
              {db}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}