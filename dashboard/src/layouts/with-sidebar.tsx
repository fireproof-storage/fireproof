import { JSX, useContext } from "react";
import { Outlet } from "react-router-dom";
import { ButtonToggleSidebar } from "../components/ButtonToggleSidebar.tsx";
import { Sidebar } from "../components/Sidebar.tsx";
import { TopArea } from "../components/TopArea.tsx";
import { AppContext } from "../app-context.tsx";

export function WithSidebar({ sideBarComponent, title }: { sideBarComponent: JSX.Element; title: string }) {
  const { isSidebarOpen, toggleSidebar } = useContext(AppContext);
  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Mobile Menu Button - Hidden when sidebar is open */}
      {/* missing FireProofLogo in mobile state */}
      {!isSidebarOpen && <ButtonToggleSidebar toggleSidebar={toggleSidebar} />}
      {/* Sidebar */}
      <Sidebar sideBarComponent={sideBarComponent} title={title} />
      <main className="flex-1 overflow-y-auto p-6 md:p-10">
        <TopArea withSidebar={true} />
        <Outlet />
      </main>
    </div>
  );
}
