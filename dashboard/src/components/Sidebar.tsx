import { Link, useParams } from "react-router-dom";

import { DocBase, useFireproof } from "use-fireproof";
import { docs } from "../data";

export function Sidebar() {
  const { name: dbName } = useParams();

  const { database } = useFireproof(dbName);

  function addData() {
    docs.forEach(async (doc: DocBase) => {
      await database.put(doc);
    });
  }

  return (
    <div className="Sidebar p-4 dark:bg-gray-900 bg-slate-200">
      <ul className="mt-4">
        <li className="mb-2">
          <Link
            to="/"
            className="flex items-center p-2 text-gray-500 transition duration-75 dark:text-gray-400 hover:dark:text-white hover:text-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg
              className="w-6 h-6 text-gray-800 dark:text-white"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 20 20"
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.1"
                d="M6 14H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1M5 19h5m-9-9h5m4-4h8a1 1 0 0 1 1 1v12H9V7a1 1 0 0 1 1-1Zm6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"
              />
            </svg>
            <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">All Databases</span>
          </Link>
        </li>
        <li className="ml-4">
          {dbName && (
            <ul>
              <li className="mb-2">
                <Link
                  to={`/db/${dbName}`}
                  className="flex items-center p-2 text-gray-500 transition duration-75 dark:text-gray-400 hover:dark:text-white hover:text-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg
                    className="w-6 h-6 text-gray-800 dark:text-white"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 18 20"
                  >
                    <path
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.1"
                      d="M17 4c0 1.657-3.582 3-8 3S1 5.657 1 4m16 0c0-1.657-3.582-3-8-3S1 2.343 1 4m16 0v6M1 4v6m0 0c0 1.657 3.582 3 8 3s8-1.343 8-3M1 10v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6"
                    />
                  </svg>
                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">List Documents</span>
                </Link>
              </li>
              <li className="mb-2">
                <Link
                  to={`/db/${dbName}/doc`}
                  className="flex items-center p-2 text-gray-500 transition duration-75 dark:text-gray-400 hover:dark:text-white hover:text-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                    />
                  </svg>

                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">Create Document</span>
                </Link>
              </li>
              <li className="mb-2">
                <Link
                  to={`/db/${dbName}/history`}
                  className="flex items-center p-2 text-gray-500 transition duration-75 dark:text-gray-400 hover:dark:text-white hover:text-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">History</span>
                </Link>
              </li>
              <li className="mb-2">
                <Link
                  to={`/db/${dbName}/query`}
                  className="flex items-center p-2 text-gray-500 transition duration-75 dark:text-gray-400 hover:dark:text-white hover:text-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">Query</span>
                </Link>
              </li>
            </ul>
          )}
        </li>
      </ul>
    </div>
  );
}
