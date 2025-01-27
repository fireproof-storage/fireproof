import { useContext } from "react";
import { NavLink, useParams } from "react-router-dom";
import { AppContext } from "../app-context.tsx";
import { WithSidebar } from "../layouts/with-sidebar.tsx";

export function Cloud() {
  // useContext(AppContext).cloud.updateContext();
  return (
    <WithSidebar sideBarComponent={<SidebarCloud />} />
  );
}

function SidebarCloud() {
  const { sideBar } = useContext(AppContext);
  const { setIsSidebarOpen } = sideBar;
  const { tenantId } = useParams();

  if (!tenantId) return null;

  const navItems = [
    { label: "Home", path: `/fp/cloud/tenants/${tenantId}` },
    { label: "Ledgers", path: `/fp/cloud/tenants/${tenantId}/ledgers` },
    { label: "Members", path: `/fp/cloud/tenants/${tenantId}/members` },
    { label: "Admin", path: `/fp/cloud/tenants/${tenantId}/admin` }
  ];

  return (
    <div className="space-y-1">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          onClick={() => setIsSidebarOpen(false)}
          className={({ isActive }) => `
            flex items-center rounded-md px-3 py-2 text-sm transition-colors
            ${isActive 
              ? "active bg-[--accent] text-[--foreground] font-medium" 
              : "text-[--muted-foreground] hover:bg-[--accent] hover:text-[--foreground]"}
          `}
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
