import { useContext } from "react";
import { useParams } from "react-router-dom";
import { AppContext } from "../../../../app-context.tsx";
import { SelectedTenantLedger } from "../../api/selected-tenant-ledger.tsx";

export function LedgerOverview() {
  const { tenantId, ledgerId } = useParams();
  const { cloud } = useContext(AppContext);
  // const listTenants = cloud.getListTenantsByUser();
  const listTenantsLedgers = cloud.getListTenantsLedgersByUser();
  const cloudToken = cloud.getCloudToken();

  if (listTenantsLedgers.isPending) {
    return <div>Loading...</div>;
  }
  if (cloudToken.isPending) {
    return <div>Loading...</div>;
  }
  if (!cloudToken.data) {
    return <div>Not found</div>;
  }
  if (!listTenantsLedgers.data) {
    return <div>Not found</div>;
  }

  if (!ledgerId) {
    return <div>Not found</div>;
  }
  if (!tenantId) {
    return <div>Not found</div>;
  }

  const tenant = listTenantsLedgers.data.find((t) => t.tenant.tenantId === tenantId);

  if (!tenant) {
    return <div>Not found</div>;
  }

  const ledger = tenant.ledgers.find((l) => l.ledgerId === ledgerId);

  if (!ledger) {
    return <div>Not found</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="bg-[--muted] shadow sm:rounded-lg p-6">
        <h2 className="text-lg font-semibold text-[--foreground] mb-4">Onboarding - Quickstart</h2>
        <div className="text-[--muted-foreground]">
          To connect your database to Fireproof Cloud, use this code:
          <SelectedTenantLedger
            tenantAndLedger={{
              tenant: tenantId,
              ledger: ledgerId,
            }}
            cloudToken={cloudToken.data.token}
            dbName={ledger.name}
          />
          To learn more about using Fireproof Cloud, check out our{" "}
          <a href="https://use-fireproof.com/docs/getting-started" className="text-[--accent] hover:underline">
            documentation
          </a>
          .
        </div>
      </div>
    </div>
  );
}
