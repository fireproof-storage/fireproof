import { useContext } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { UserTenant } from "../../../../backend/api.ts";
import { AppContext } from "../../../app-context.tsx";

function isAdmin(ut: UserTenant) {
  return ut.role === "admin";
}

export async function clientLoader() {
  return {
    redirect: "overview",
  };
}

export function CloudTenantShow() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const listTenants = cloud.getListTenantsByUser();
  const navigate = useNavigate();
  const location = useLocation();

  if (listTenants.isLoading) {
    return <div>Loading...</div>;
  }
  if (!listTenants.data) {
    return <div>Not found</div>;
  }

  const tenant = listTenants.data.tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    return <div>Not found</div>;
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members" },
    { id: "admin", label: "Settings" },
  ];

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="border-b border-[--border]">
          <nav className="flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                className={`
                  px-4 py-2 text-sm font-medium border-b-2
                  ${
                    location.pathname.endsWith(tab.id)
                      ? "border-[--accent] text-[--accent]"
                      : "border-transparent text-[--muted-foreground] hover:text-[--foreground] hover:border-[--border]"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
