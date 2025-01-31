import { useContext } from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { AppContext } from "../app-context.tsx";
import { Plus } from "../components/Plus.tsx";
import { WithSidebar } from "../layouts/with-sidebar.tsx";

export function Cloud() {
  // useContext(AppContext).cloud.updateContext();
  return <WithSidebar sideBarComponent={<SidebarCloud />} />;
}

function SidebarCloud() {
  const { sideBar, cloud } = useContext(AppContext);
  const { setIsSidebarOpen } = sideBar;
  const { tenantId } = useParams();
  const location = useLocation();
  console.log("tenantId", tenantId);
  const ledgerList = cloud.getListLedgersByUser(tenantId);

  if (ledgerList.isPending) {
    return <div>Loading...</div>;
  }
  
  if (!ledgerList.data) {
    // navigate("/fp/cloud");
    return <div>Not found</div>;
  }

  function isHomeActive(path: string) {
    const regex = new RegExp(`/fp/cloud/tenants/${tenantId}/(overview|members|admin)?$`);
    return regex.test(location.pathname) || path === location.pathname;
  }

  const navItems = [
    { label: "Home", path: `/fp/cloud/tenants/${tenantId}` },
    { label: "Ledgers", path: `/fp/cloud/tenants/${tenantId}/ledgers` },
    // { label: "Members", path: `/fp/cloud/tenants/${tenantId}/members` },
    // { label: "Admin", path: `/fp/cloud/tenants/${tenantId}/admin` },
  ];

  return (
    <div className="space-y-1">
      {navItems.map((item) => (
        <div key={item.path} className="flex items-center justify-between">
          <NavLink
            to={item.path}
            onClick={() => setIsSidebarOpen(false)}
            end={item.label !== "Home"}
            className={({ isActive }) => `
              flex items-center rounded-md px-3 py-2 text-sm transition-colors flex-1
              ${
                (item.label === "Home" ? isHomeActive(item.path) : isActive)
                  ? "active bg-[--accent] text-[--foreground] font-medium"
                  : "text-[--muted-foreground] hover:bg-[--accent] hover:text-[--foreground]"
              }
            `}
          >
            {item.label}
          </NavLink>
          {item.label === "Ledgers" && (
            <NavLink
              to={`/fp/cloud/tenants/${tenantId}/ledgers/new`}
              className="p-1 hover:bg-[--accent]/10 rounded mr-2"
              title="Create New Ledger"
            >
              <Plus />
            </NavLink>
          )}
        </div>
      ))}

      {/* Ledger List */}
      <div className="pl-4 mt-2">
        {ledgerList.data.ledgers
          .filter((i) => i.tenantId === tenantId)
          .map((ledger) => (
            <NavLink
              key={ledger.ledgerId}
              to={`/fp/cloud/tenants/${tenantId}/ledgers/${ledger.ledgerId}`}
              onClick={() => setIsSidebarOpen(false)}
              className={({ isActive }) => `
              flex items-center rounded-md px-3 py-1.5 text-sm transition-colors
              ${
                isActive
                  ? "bg-[--accent] text-[--foreground] font-medium"
                  : "text-[--muted-foreground] hover:bg-[--accent] hover:text-[--foreground]"
              }
            `}
            >
              {ledger.name}
            </NavLink>
          ))}
      </div>
    </div>
  );
}
