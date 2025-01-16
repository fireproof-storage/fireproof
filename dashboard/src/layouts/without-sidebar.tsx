import { createContext, JSX, useContext, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { ButtonToggleSidebar } from "../components/ButtonToggleSidebar.tsx";
import { Sidebar } from "../components/Sidebar.tsx";
import { TopArea } from "../components/TopArea.tsx";
import { AppContext } from "../app-context.tsx";

export function WithoutSidebar() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <TopArea />
        <Outlet />
      </main>
    </div>
  );
}
