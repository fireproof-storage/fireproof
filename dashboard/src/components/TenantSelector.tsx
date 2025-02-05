import { useContext, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppContext } from "../app-context.tsx";
import { tenantName } from "../helpers.ts";

export function TenantSelector() {
  const { cloud } = useContext(AppContext);
  const navigate = useNavigate();
  const { tenantId } = useParams();
  const location = useLocation();
  const listTenants = cloud.getListTenantsByUser().data;

  useEffect(() => {
    const isIndexPage = location.pathname === "/fp/cloud";
    if (listTenants?.tenants?.length && isIndexPage) {
      const defaultTenant = listTenants.tenants[0];
      navigate(`/fp/cloud/tenants/${defaultTenant.tenantId}/overview`);
    }
  }, [listTenants?.tenants, navigate, location.pathname]);

  if (!listTenants?.tenants?.length) return null;

  return (
    <div className="p-4">
      <div className="flex flex-col gap-2">
        <select
          className="w-full py-1.5  bg-fp-bg-00 border border-fp-dec-00 rounded-fp-s text-14 text-fp-p placeholder-fp-dec-01 focus:placeholder-transparent focus:outline-none focus:ring-1 focus:ring-fp-dec-01 focus:border-transparent"
          onChange={(e) => {
            if (e.target.value === "new") {
              navigate("/fp/cloud/tenants/new");
              return;
            }
            const selectedTenant = listTenants.tenants.find((t) => t.tenantId === e.target.value);
            if (selectedTenant) {
              navigate(`/fp/cloud/tenants/${selectedTenant.tenantId}/overview`);
            }
          }}
          value={tenantId || listTenants.tenants[0]?.tenantId}
        >
          {listTenants.tenants.map((tenant) => (
            <option key={tenant.tenantId} value={tenant.tenantId}>
              {tenantName(tenant)}
            </option>
          ))}
          <option value="new">➕ New Tenant</option>
        </select>
      </div>
    </div>
  );
}
