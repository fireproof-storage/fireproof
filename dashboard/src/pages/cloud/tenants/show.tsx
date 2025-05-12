import { useContext } from "react";
import { Outlet, useParams } from "react-router-dom";
import { AppContext } from "../../../app-context.tsx";
import { TabNavigation } from "../../../components/TabNavigation.tsx";

export async function clientLoader() {
  return {
    redirect: "overview",
  };
}

export function CloudTenantShow() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const listTenants = cloud.getListTenantsByUser();

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
    // { id: "overview", label: "Overview" },
    { id: "members", label: "Members" },
    { id: "admin", label: "Settings" },
  ];

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <TabNavigation tabs={tabs} className="mb-4" />
        <div className="">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
