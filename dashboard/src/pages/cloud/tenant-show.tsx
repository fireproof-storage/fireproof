import { useParams } from "react-router-dom";
import { tenantName, useListTendantsByUser } from "../../hooks/tenant.ts";

export function TenantShow() {
  const { tenantId } = useParams();
  const list = useListTendantsByUser();
  const tenant = list.tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    return <>Tenant not{tenantId} found</>;
  }

  return (
    <div>
      <h1>{tenantName(tenant)}</h1>
      <pre>{JSON.stringify(tenant, null, 2)}</pre>
      <p>{tenant.tenantId}</p>
      <p>{list.authUserId}</p>
      <p>{list.userRefId}</p>
    </div>
  );
}
