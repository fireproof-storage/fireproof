import React from "react";
import { Outlet } from "react-router-dom";
import { TopArea } from "../components/TopArea.jsx";

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
