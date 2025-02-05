import { Outlet, useParams } from "react-router-dom";
import { TabNavigation } from "../../../../components/TabNavigation.tsx";

export function CloudTenantLedgersShow() {
  const { ledgerId } = useParams();

  const tabs = [
    { id: "documents", label: "Documents" },
    { id: "sharing", label: "Sharing" },
  ];

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <TabNavigation tabs={tabs} />
        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

// Move these to their own route components
export function LedgerDocumentsTab() {
  const { ledgerId } = useParams();
  return (
    <div>
      <p className="text-[--muted-foreground]">Manage documents for ledger {ledgerId} here.</p>
    </div>
  );
}

export function LedgerSharingTab() {
  const { ledgerId } = useParams();
  return (
    <div>
      <p className="text-[--muted-foreground]">Control who has access to your ledger.</p>
    </div>
  );
}
