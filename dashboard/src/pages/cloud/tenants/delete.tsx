import { Link, redirect, useNavigate, useParams } from "react-router-dom";
import { AppContext } from "../../../app-context.tsx";
import { useContext } from "react";
import { CloudContext } from "../../../cloud-context.ts";

export function CloudTenantDelete() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);

  const { refetch, data } = cloud.getListTenantsByUser();
  const navigate = useNavigate();

  const tenant = data?.tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    return <h1>Not found</h1>;
  }

  async function deleteCloudTenantAction(ctx: CloudContext, tenantId: string | undefined) {
    if (tenantId) {
      await ctx.api.deleteTenant({ tenantId });
      console.log("deleted", tenantId);
      refetch();
      navigate(`/fp/cloud`);
    }
  }
  return (
    <h1>
      <Link
        to={`/fp/cloud`}
        onClick={(e) => {
          e.preventDefault();
          deleteCloudTenantAction(cloud, tenantId);
        }}
      >
        Delete {tenantId} -- {tenant.tenant.name} -- {tenant.user.name}
      </Link>
    </h1>
  );
}
