import { Outlet, useParams } from "react-router-dom";
import { TabNavigation } from "../../../../components/TabNavigation.tsx";

/**
 * Main component for displaying ledger details with tabbed navigation
 */
export function CloudTenantLedgersShow() {
  const { ledgerId } = useParams();

  const tabs = [
    { id: "overview", label: "Overview" },
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
