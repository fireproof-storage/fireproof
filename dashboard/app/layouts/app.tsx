import {
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { fireproof } from "use-fireproof";

export async function clientLoader() {
  console.log("loading databases");
  const databases = await getIndexedDBNamesWithQueries();
  return databases;
}

async function getIndexedDBNamesWithQueries(): Promise<
  { name: string; queries: any[] }[]
> {
  try {
    const databases = await indexedDB.databases();
    const fireproofDbs = databases
      .filter(
        (db) => db.name!.startsWith("fp.") && !db.name!.endsWith("_queries")
      )
      .map((db) => db.name!.substring(3));

    const dbsWithQueries = await Promise.all(
      fireproofDbs.map(async (dbName) => {
        const queryDbName = `${dbName}_queries`;
        const queryDb = fireproof(queryDbName);
        const allDocs = await queryDb.allDocs({ includeDocs: true });
        const queries = allDocs.rows.map((row) => row.value);

        return { name: dbName, queries };
      })
    );

    return dbsWithQueries;
  } catch (error) {
    console.error("Error fetching IndexedDB names and queries:", error);
    return [];
  }
}

export default function Layout() {
  const databases = useLoaderData<{ name: string; queries: any[] }[]>();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navigate = useNavigate();
  const params = useParams();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const darkModePreference = localStorage.getItem("darkMode");
    return darkModePreference === "true";
  });

  useEffect(() => {
    if (params.name) {
      setOpenMenu(params.name);
    }
  }, [params.name]);

  useEffect(() => {
    // Apply dark mode class to the root element
    document.documentElement.classList.toggle("dark", isDarkMode);
    // Save user's preference
    localStorage.setItem("darkMode", isDarkMode.toString());
  }, [isDarkMode]);

  const toggleMenu = (dbName: string) => {
    setOpenMenu(openMenu === dbName ? null : dbName);
  };

  const navigateToDatabase = (dbName: string) => {
    navigate(`/fp/databases/${dbName}`);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const navLinks = [
    { to: "", label: "All Documents" },
    { to: "/history", label: "History" },
    { to: "/query", label: "Query" },
  ];

  const truncateDbName = (name: string, maxLength: number) => {
    if (name.length <= maxLength) return name;
    return `${name.substring(0, maxLength - 3)}...`;
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="flex flex-col w-[280px] border-r bg-[--muted] overflow-hidden">
        <div className="flex h-[60px] items-center px-6 flex-shrink-0">
          <Link
            to="/fp/databases"
            className="flex items-center gap-2 font-semibold"
          >
            <img src="/fp-logo.svg" alt="Fireproof Logo" className="h-6 w-6" />
            <span>Fireproof Console</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <nav className="grid gap-4 px-6 py-4 text-sm font-medium">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Databases</span>
              </div>
              <Link
                data-id="15"
                className="inline-flex h-8 items-center justify-center rounded bg-[--accent] px-3 text-accent-foreground transition-colors hover:bg-[--accent]/80"
                to="/fp/databases/new"
              >
                <svg
                  data-id="3"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M5 12h14"></path>
                  <path d="M12 5v14"></path>
                </svg>
              </Link>
            </div>
            <div className="grid gap-2">
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
                      openMenu === db.name
                        ? "max-h-[500px] opacity-100"
                        : "max-h-0 opacity-0"
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
            </div>
          </nav>
        </div>
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6 shadow-sm flex-shrink-0">
          <h1 className="flex-1 text-lg font-semibold"></h1>
          <div className="flex items-center gap-4">
            <a href="https://use-fireproof.com" className="hover:underline">
              Docs
            </a>
            <a
              href="https://fireproof.storage/blog/"
              className="hover:underline"
            >
              Blog
            </a>
            <a
              href="https://discord.com/invite/cCryrNHePH"
              className="hover:underline"
            >
              Community
            </a>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full bg-[--muted] text-[--muted-foreground] hover:bg-[--muted]/80"
            >
              {isDarkMode ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
