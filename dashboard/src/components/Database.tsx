import { NavLink, useLoaderData, useNavigate } from "react-router-dom";
import { AppContext, AppLayout } from "../layouts/app.tsx";
import { useContext } from "react";
import { truncateDbName } from "../helpers.ts";

export function Database() {
  const { databases } = useLoaderData<{
    databases: { name: string; queries: any[] }[];
  }>();
  const { openMenu, toggleMenu, setIsSidebarOpen } = useContext(AppContext);

  return (
    <AppLayout
      sideBarComponent={
        <SidebarDatabases databases={databases} openMenu={openMenu} toggleMenu={toggleMenu} setIsSidebarOpen={setIsSidebarOpen} />
      }
    />
  );
}


const navLinks = [
    { to: "", label: "All Documents" },
    { to: "/history", label: "History" },
    { to: "/query", label: "Query" },
  ];

function SidebarDatabases({
  databases,
  openMenu,
  toggleMenu,
  setIsSidebarOpen,
}: {
  databases: { name: string; queries: any[] }[];
  openMenu: string | null;
  toggleMenu: (dbName: string) => void;
  setIsSidebarOpen: (value: boolean) => void;
}) {
  const navigate = useNavigate();
  const navigateToDatabase = (dbName: string) => {
    navigate(`/fp/databases/${dbName}`);
    setIsSidebarOpen(false); // Close sidebar on mobile after navigation
  };
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
