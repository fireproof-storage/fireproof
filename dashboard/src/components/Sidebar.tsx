import { useParams } from 'react-router-dom'

export function Sidebar() {
  const { dbName } = useParams()
  return (
    <div className="Sidebar w-1/4 p-4 dark:bg-gray-900 bg-slate-200">
      <ul className="mt-4">
        <li className="mb-2">
          <a
            href="/databases"
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
            <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">
              All Databases
            </span>
          </a>
        </li>
        <li className="ml-4">
          {dbName && (
            <ul>
              <li className="mb-2">
                <a
                  href={'/db/' + dbName}
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
                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">
                    <code>{dbName}</code>
                  </span>
                </a>
              </li>
              <li className="mb-2">
                <a
                  href={'/all/' + dbName}
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

                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">
                    All Documents
                  </span>
                </a>
              </li>
              <li className="mb-2">
                <a
                  href={'/doc/' + dbName}
                  className="flex items-center p-2 text-gray-500 transition duration-75 dark:text-gray-400 hover:dark:text-white hover:text-black rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="flex-shrink-0 w-6 h-6 "
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">
                    Create Document
                  </span>
                </a>
              </li>
              <li className="mb-2">
                <a
                  href={'/changes/' + dbName}
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="flex-1 ml-3 whitespace-nowrap text-black dark:text-white">
                    Changes
                  </span>
                </a>
              </li>
            </ul>
          )}
        </li>
      </ul>
    </div>
  )
}
