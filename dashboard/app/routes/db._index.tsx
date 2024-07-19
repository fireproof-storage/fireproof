import { useEffect, useState } from "react";
import { Link } from "react-router-dom";


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

const [databases, setDatabases] = useState<string[]>([]);

useEffect(() => {
  async function fetchDatabases() {
    const dbNames = await getIndexedDBNames();
    setDatabases(dbNames);
  }
  fetchDatabases();
}, []);

  
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Available Databases</h2>
      <p className="mb-4">This is the index page for the /db route.</p>
      <div className="relative overflow-x-auto dark mt-4">
        <div className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <div className="text-xs text-gray-700 bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <div key={'header'+Math.random()} className="px-6 py-3">
              Database Name
            </div>
          </div>
          <div>
            {databases.map((db, index) => (
              <div key={db} className={`bg-white dark:bg-gray-800 ${index < databases.length - 1 ? 'border-b dark:border-gray-700' : ''}`}>
                <div className="px-6 py-4">
                  <Link to={`/db/${db}`} className="underline text-blue-500">
                    {db}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


async function getIndexedDBNames(): Promise<string[]> {
  try {
    const databases = await indexedDB.databases();
    return databases
      .filter(db => db.name!.startsWith('fp.'))
      .map(db => db.name!.substring(3));
  } catch (error) {
    console.error("Error fetching IndexedDB names:", error);
    return [];
  }
}





