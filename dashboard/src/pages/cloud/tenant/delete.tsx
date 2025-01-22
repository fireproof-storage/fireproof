import { Link, redirect, useParams } from "react-router-dom";
import { AppContext } from "../../../app-context.tsx";
import { useContext } from "react";
import { CloudContext } from "../../../cloud-context.ts";

async function deleteCloudTenantAction(ctx: CloudContext, tenantId: string | undefined, refresh: () => void) {
  if (tenantId) {
    await ctx.api.deleteTenant({ tenantId });
    refresh();
    return redirect(`/fp/cloud`);
  }
}

export function CloudTenantDelete() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const { refresh } = cloud.useListTenantsByUser();
  return (
    <h1>
      <Link to={`/fp/cloud`} onClick={() => deleteCloudTenantAction(cloud, tenantId, refresh)}>
        Delete {tenantId}
      </Link>
    </h1>
  );
}
