import React from "react";
import { createContext, JSX, useContext, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { ButtonToggleSidebar } from "../components/ButtonToggleSidebar.jsx";
import { Sidebar } from "../components/Sidebar.jsx";
import { TopArea } from "../components/TopArea.jsx";
import { AppContext } from "../app-context.jsx";

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
