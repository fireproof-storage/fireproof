import { createContext, JSX, useEffect, useState } from "react";
import { Link, NavLink, Outlet, redirect, useLoaderData, useNavigate, useParams } from "react-router-dom";
import { fireproof } from "use-fireproof";
import { SYNC_DB_NAME } from "../pages/databases/show.tsx";
import { User } from "../components/User.tsx";
import { ButtonToggleSidebar } from "../components/ButtonToggleSidebar.tsx";
import { Sidebar } from "../components/Sidebar.tsx";
import { TopArea } from "../components/TopArea.tsx";

const reservedDbNames: string[] = [`fp.${SYNC_DB_NAME}`, "fp.petname_mappings", "fp.fp_sync"];

export async function loader(/*{ request }*/) {
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

export interface AppLayoutContext {
  openMenu: string | null;
  setOpenMenu: (dbName: string | null) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (value: boolean) => void;
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  toggleMenu: (dbName: string) => void;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
}

export const AppContext = createContext<AppLayoutContext>({
  openMenu: null,
  setOpenMenu: () => {},
  isSidebarOpen: false,
  setIsSidebarOpen: () => {},
  isDarkMode: false,
  setIsDarkMode: () => {},
  toggleMenu: () => {},
  toggleDarkMode: () => {},
  toggleSidebar: () => {},
});

export function AppLayout({ sideBarComponent }: { sideBarComponent: JSX.Element }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // const navigate = useNavigate();

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
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("darkMode", isDarkMode.toString());
  }, [isDarkMode]);

  const toggleMenu = (dbName: string) => {
    setOpenMenu(openMenu === dbName ? null : dbName);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };
  return (
    <AppContext.Provider
      value={
        {
          openMenu,
          setOpenMenu,
          isSidebarOpen,
          setIsSidebarOpen,
          isDarkMode,
          setIsDarkMode,
          toggleMenu,
          toggleDarkMode,
          toggleSidebar,
        } satisfies AppLayoutContext
      }
    >
      <div className="flex h-screen w-full overflow-hidden">
        {/* Mobile Menu Button - Hidden when sidebar is open */}
        {!isSidebarOpen && <ButtonToggleSidebar toggleSidebar={toggleSidebar} />}

        {/* Sidebar */}
        <Sidebar sideBarComponent={sideBarComponent} />

        <TopArea isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />

        {/* <main className="flex-1 overflow-y-auto p-6 md:p-10">
          <Outlet context={{ user }} />
        </main> */}
      </div>
    </AppContext.Provider>
  );
}
