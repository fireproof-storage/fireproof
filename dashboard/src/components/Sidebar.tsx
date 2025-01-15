import { JSX, useContext } from "react";
import { Link, useParams } from "react-router-dom";

import { DocBase, useFireproof } from "use-fireproof";
import App from "../../backend/App.tsx";
import { AppContext } from "../layouts/app.tsx";
//

export function Sidebar({
  sideBarComponent,
}: {
  sideBarComponent: JSX.Element;
}) {
  const { isSidebarOpen, setIsSidebarOpen, } = useContext(AppContext);
  return (
    <div
      className={`fixed md:static inset-0 z-40 w-[280px] transform transition-transform duration-300 ease-in-out ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0 flex flex-col border-r bg-[--muted] overflow-hidden`}
    >
      <div className="flex h-[60px] items-center px-5 flex-shrink-0 justify-between">
        <Link to="/fp/databases" className="flex items-center gap-2 font-semibold" onClick={() => setIsSidebarOpen?.(false)}>
          <img
            src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+DQo8IS0tIENyZWF0b3I6IENvcmVsRFJBVyBYNyAtLT4NCjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiB2ZXJzaW9uPSIxLjEiIHN0eWxlPSJzaGFwZS1yZW5kZXJpbmc6Z2VvbWV0cmljUHJlY2lzaW9uOyB0ZXh0LXJlbmRlcmluZzpnZW9tZXRyaWNQcmVjaXNpb247IGltYWdlLXJlbmRlcmluZzpvcHRpbWl6ZVF1YWxpdHk7IGZpbGwtcnVsZTpldmVub2RkOyBjbGlwLXJ1bGU6ZXZlbm9kZCINCnZpZXdCb3g9IjYwMDAgNjAwMCA1MDAwIDUwMDAiDQogeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPg0KIDxkZWZzPg0KICA8c3R5bGUgdHlwZT0idGV4dC9jc3MiPg0KICAgPCFbQ0RBVEFbDQogICAgLmZpbDEge2ZpbGw6bm9uZX0NCiAgICAuZmlsMyB7ZmlsbDojRUU1MjFDfQ0KICAgIC5maWwyIHtmaWxsOiNGMTZDMTJ9DQogICAgLmZpbDQge2ZpbGw6I0Y1ODcwOX0NCiAgICAuZmlsNSB7ZmlsbDojRjlBMTAwfQ0KICAgIC5maWwwIHtmaWxsOndoaXRlfQ0KICAgXV0+DQogIDwvc3R5bGU+DQogPC9kZWZzPg0KIDxnIGlkPSJMYXllcl94MDAyMF8xIj4NCiAgPGcgaWQ9Il83NDUyMDM5MjAiPg0KICAgPGxpbmUgY2xhc3M9ImZpbDEiIHgxPSI4MzMzIiB5MT0iNjAzNCIgeDI9IjYzNDIiIHkyPSAiOTQ4MyIgLz4NCiAgIDxwb2x5Z29uIGNsYXNzPSJmaWwyIiBwb2ludHM9Ijg5OTcsNzE4MyA4MzkxLDcwMjEgNzY2OSw3MTg0IDcwMDYsODMzMyA3MDA2LDgzMzMgNzQ4OSw4NDY4IDgzMzMsODMzMyAiLz4NCiAgIDxwYXRoIGNsYXNzPSJmaWwzIiBkPSJNNzY2OSA3MTgzbDY0NyAwIDY4MSAwYzAsLTQ5MSAtMjY3LC05MjAgLTY2MywtMTE0OWwtMSAwIC02NjQgMTE0OXoiLz4NCiAgIDxwYXRoIGNsYXNzPSJmaWw0IiBkPSJNODMzMyA4MzMzbC0xMzI3IDBjMCwwIDAsMCAwLDEgMCwwIC0xLDAgLTEsMGwtNjYzIDExNDkgNzc1IDI1NyA1NTIgLTI1NyA2NjQgLTExNDkgMCAtMXptNjY0IDExNTBsNTk0IDIzMCA3MzMgLTIzMCAxIDBjMCwtNDkxIC0yNjcsLTkyMCAtNjY0LC0xMTUwbDAgMCAtNjY0IDExNTB6Ii8+DQogICA8cGF0aCBjbGFzcz0iZmlsNSIgZD0iTTc2NjkgOTQ4M2wtMTMyNyAwIDY2NCAxMTUwIDAgMCAxMzI3IDBjLTM5NywtMjMwIC02NjQsLTY1OSAtNjY0LC0xMTUwbDAgMHptMjY1NiAwbC0xMzI4IDAgLTY2NCAxMTUwIDEzMjggMCA2NjQgLTExNTB6Ii8+DQogIDwvZz4NCiA8L2c+DQo8L3N2Zz4NCg=="
            alt="Fireproof Logo"
            className="h-6 w-6"
          />
          <span>Fireproof Dashboard</span>
        </Link>
        {/* Close button for mobile */}
        <button onClick={() => setIsSidebarOpen?.(false)} className="md:hidden p-2 rounded-md bg-[--muted] hover:bg-[--muted]/80">
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
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
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
              onClick={() => setIsSidebarOpen?.(false)}
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
          <div className="grid gap-2">{sideBarComponent}</div>
        </nav>
      </div>
    </div>
  );
}
