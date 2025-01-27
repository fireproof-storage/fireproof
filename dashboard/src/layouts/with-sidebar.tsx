import { JSX, useContext } from "react";
import { Outlet } from "react-router-dom";
import { AppContext } from "../app-context.tsx";
import { ButtonToggleSidebar } from "../components/ButtonToggleSidebar.tsx";
import { Sidebar } from "../components/Sidebar.tsx";
import { TopArea } from "../components/TopArea.tsx";

export function WithSidebar({ sideBarComponent, title, newUrl }: { sideBarComponent: JSX.Element; title: string; newUrl: string }) {
  const { isSidebarOpen, toggleSidebar } = useContext(AppContext).sideBar;
  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Mobile Menu Button - Hidden when sidebar is open */}
      {/* missing FireProofLogo in mobile state */}
      {!isSidebarOpen && <ButtonToggleSidebar toggleSidebar={toggleSidebar} />}
      {/* Sidebar */}
      <Sidebar sideBarComponent={sideBarComponent} title={title} newUrl={newUrl} />
      <main className="flex-1 overflow-y-auto">
        <TopArea withSidebar={true} />
          <Outlet />
      </main>
    </div>
  );
}
