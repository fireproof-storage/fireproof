import { NavLink, Outlet, useLoaderData, useNavigate } from "react-router-dom";
import { AppContext } from "../app-context.tsx";
import { useContext } from "react";
import { SYNC_DB_NAME, truncateDbName } from "../helpers.ts";
import { fireproof } from "use-fireproof";
import { WithSidebar } from "../layouts/with-sidebar.tsx";

const reservedDbNames: string[] = [`fp.${SYNC_DB_NAME}`, "fp.petname_mappings", "fp.fp_sync"];

export async function databaseLoader(/*{ request }*/) {
  const databases = await getIndexedDBNamesWithQueries();
  return { databases };
}

async function getIndexedDBNamesWithQueries(): Promise<{ name: string; queries: any[] }[]> {
  try {
    const databases = await indexedDB.databases();
    const userDbs = databases
      .filter((db) => db.name!.startsWith("fp.") && !db.name!.endsWith("_queries") && !reservedDbNames.includes(db.name!))
      .map((db) => db.name!.substring(3));

    const dbsWithQueries = await Promise.all(
      userDbs.map(async (dbName) => {
        const queryDbName = `fp_${dbName}_queries`;
        const queryDb = fireproof(queryDbName);
        const allDocs = await queryDb.allDocs({ includeDocs: true });
        const queries = allDocs.rows.map((row) => row.value);

        return { name: dbName, queries };
      }),
    );

    return dbsWithQueries;
  } catch (error) {
    console.error("Error fetching IndexedDB names and queries:", error);
    return [];
  }
}

export function Databases() {
  return <WithSidebar sideBarComponent={<SidebarDatabases />} title="Ledgers" />;
}

const navLinks = [
  { to: "", label: "All Documents" },
  { to: "/history", label: "History" },
  { to: "/query", label: "Query" },
];

function SidebarDatabases() {
  const { openMenu, toggleMenu, setIsSidebarOpen } = useContext(AppContext);
  const navigate = useNavigate();
  const navigateToDatabase = (dbName: string) => {
    navigate(`/fp/databases/${dbName}`);
    setIsSidebarOpen(false); // Close sidebar on mobile after navigation
  };
  const { databases } = useLoaderData<{
    databases: { name: string; queries: any[] }[];
  }>();
  return (
    <>
      {databases.map((db) => (
        <div key={db.name}>
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => navigateToDatabase(db.name)}
              className="flex-grow text-left rounded px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
            >
              <span title={db.name}>{truncateDbName(db.name, 20)}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMenu(db.name);
              }}
              className="flex items-center justify-center w-8 h-8 rounded transition-colors hover:bg-muted"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 transition-transform duration-200 ${openMenu === db.name ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
          <div
            className={`pl-6 mt-2 space-y-2 overflow-hidden transition-all duration-200 ease-in-out ${
              openMenu === db.name ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            {navLinks.map((link) => (
              <NavLink
                end
                key={link.to}
                to={`/fp/databases/${db.name}${link.to}`}
                className={({ isActive }) =>
                  `block rounded px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground ${
                    isActive ? "font-bold" : ""
                  }`
                }
                onClick={() => setIsSidebarOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
            {db.queries.length > 0 && (
              <div className="text-sm text-muted-foreground pl-3">
                Saved Queries:
                {db.queries.map((query, index) => (
                  <NavLink
                    key={index}
                    to={`/fp/databases/${db.name}/query/${query._id}`}
                    className="block rounded px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
                  >
                    {query.name || `Query ${index + 1}`}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
