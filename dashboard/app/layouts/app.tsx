import { Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";

export async function clientLoader() {
  const databases = await getIndexedDBNames();
  return databases;
}

async function getIndexedDBNames(): Promise<string[]> {
  try {
    const databases = await indexedDB.databases();
    return databases
      .filter((db) => db.name!.startsWith("fp."))
      .map((db) => db.name!.substring(3));
  } catch (error) {
    console.error("Error fetching IndexedDB names:", error);
    return [];
  }
}

export default function Layout() {
  const databases = useLoaderData();

  return (
    <div className="grid min-h-screen w-full grid-cols-1 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col border-b md:border-r bg-muted/40">
        <div className="flex h-[60px] items-center px-6">
          <Link
            href="#"
            className="flex items-center gap-2 font-semibold"
            prefetch={false}
          >
            <span>Fireproof Console</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto">
          <nav className="grid gap-4 px-4 py-4 text-sm font-medium">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Databases</span>
              </div>
              <Link
                href="#"
                className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-accent-foreground transition-colors hover:bg-accent/80"
                prefetch={false}
              >
                <span className="sr-only">New database</span>
              </Link>
            </div>
            <div className="grid gap-2">
              {databases.map((db, index) => (
                <NavLink
                  key={index}
                  to={`/fp/databases/${db}`}
                  style={({ isActive }) => {
                    return {
                      fontWeight: isActive ? "bold" : "",
                    };
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
                >
                  {db.substring(0, 20)} {db.length >= 20 && "..."}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>
      <div className="flex flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-6 shadow-sm">
          <h1 className="flex-1 text-lg font-semibold">Current Database</h1>
          <div className="flex items-center gap-4">
            <div>Docs</div>
            <div>Blog</div>
            <div>Community</div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 md:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
