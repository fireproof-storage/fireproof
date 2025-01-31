import { useContext } from "react";
import { useParams } from "react-router-dom";
import { UserTenant } from "../../../../backend/api.ts";
import { AppContext } from "../../../app-context.tsx";
import { tenantName } from "../../../helpers.ts";
import { CodeHighlight } from "../../../components/CodeHighlight.tsx";

function isAdmin(ut: UserTenant) {
  return ut.role === "admin";
}

export function CloudTenantShow() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const listTenants = cloud.getListTenantsByUser();

  if (listTenants.isLoading) {
    return <div>Loading...</div>;
  }
  if (!listTenants.data) {
    // navigate("/fp/cloud");
    return <div>Not found</div>;
  }

  const tenant = listTenants.data.tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    return <div>Not found</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[--foreground] mb-6">{tenantName(tenant)}</h1>

      <div className="space-y-6">
        <div className="bg-[--muted] shadow sm:rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[--foreground] mb-4">Onboarding - Quickstart</h2>
          <div className="text-[--muted-foreground]">
            To connect your database to Fireproof Cloud, use this code:
            <div className="bg-[--background] p-4 rounded-md my-4 overflow-x-auto">
              <CodeHighlight code={`await connect(db, "${tenant.tenantId}", "my-ledger-id", "token");`} />
            </div>
            {/* <pre className="bg-[--background] p-4 rounded-md my-4 overflow-x-auto">
              <code className="text-sm text-[--foreground]">
                {`await connect(db, "${tenant.tenantId}", "my-ledger-id", "token");`}
              </code>
            </pre> */}
            To learn more about using Fireproof Cloud, check out our{" "}
            <a href="https://use-fireproof.com/docs/getting-started" className="text-[--accent] hover:underline">
              documentation
            </a>
            .
          </div>
        </div>

        <div className="bg-[--muted] shadow sm:rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[--foreground] mb-4">Tenant Details</h2>
          <div className="space-y-2">
            <p className="text-[--muted-foreground]">
              <span className="font-medium">Tenant ID:</span> {tenant.tenantId}
            </p>
            <p className="text-[--muted-foreground]">
              <span className="font-medium">Your Role:</span> {tenant.role}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
