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

  if (listTenants.isPending) {
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
        <div className="flex border-b border-fp-dec-00 text-fp-p text-14 mb-4">
          <nav className="flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                className={`
                  px-4 py-2 border-b-2 select-none hover:border-fp-a-03
                  ${location.pathname.endsWith(tab.id) ? "border-fp-a-03 text-fp-a-03" : "border-transparent"}
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
