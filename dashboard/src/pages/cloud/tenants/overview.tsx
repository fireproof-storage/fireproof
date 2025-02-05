import { useContext } from "react";
import { useParams } from "react-router-dom";
import { AppContext } from "../../../app-context.js";

export function CloudTenantOverview() {
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

  return (
    <div className="space-y-6 p-6">

      <div className="bg-[--muted] shadow sm:rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[--foreground] mb-4">Onboarding - Quickstart</h2>
        <div className="text-[--muted-foreground]">
          To connect your database to Fireproof Cloud, use this code:
          <div className="bg-[--background] p-4 rounded-md my-4 overflow-x-auto">
            <code className="text-sm text-[--foreground]">
              {`await connect(db, "${tenant.tenantId}", "my-ledger-id", "token");`}
            </code>
          </div>
          To learn more about using Fireproof Cloud, check out our{" "}
          <a href="https://use-fireproof.com/docs/getting-started" className="text-[--accent] hover:underline">
            documentation
          </a>
          .
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[--background] border border-[--border] rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Tenant Details</h2>
          <dl className="grid grid-cols-1 gap-4">
            <div>
              <dt className="text-sm text-[--muted-foreground]">Name</dt>
              <dd className="text-[--foreground] font-medium">{tenant.tenant.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-[--muted-foreground]">ID</dt>
              <dd className="text-[--foreground] font-mono">{tenant.tenantId}</dd>
            </div>
            <div>
              <dt className="text-sm text-[--muted-foreground]">Your Role</dt>
              <dd className="text-[--foreground] font-medium capitalize">{tenant.role}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
