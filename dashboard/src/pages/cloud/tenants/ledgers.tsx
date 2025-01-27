import { useContext } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { AppContext } from "../../../app-context.tsx";

export function CloudTenantLedgers() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  //   const { val: listTenants } = cloud.useListTenantsByUser();
  const ledgerList = cloud.getListLedgersByTenant(tenantId!);
  const navigate = useNavigate();
  
//    const tenant = listTenants.tenants.find(t => t.tenantId === tenantId);

//   if (!tenant) {
//     navigate("/fp/cloud");
//     return null;
//   }

if (ledgerList.isLoading) {
    return <div>Loading...</div>;
  }
  if (!ledgerList.data) {
    // navigate("/fp/cloud");
    return <div>Not found</div>;
  }

  return (
    <div className="flex h-full">
      {/* Left Pane - Ledger List */}
      <div className="w-64 border-r border-[--border] bg-[--muted] p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[--foreground]">Ledgers</h2>
          <Link
            to="new"
            className="p-2 bg-[--accent] text-[--accent-foreground] rounded-md hover:bg-[--accent]/80"
            title="Create New Ledger"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>

        <div className="space-y-1">
          {ledgerList.data.ledgers.map((ledger) => (
            <Link
              key={ledger.ledgerId}
              to={ledger.ledgerId}
              className="flex items-center rounded-md px-3 py-2 text-sm text-[--muted-foreground] transition-colors hover:bg-[--muted] hover:text-[--foreground]"
            >
              <span className="truncate">{ledger.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Right Pane - Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

// Default content when no ledger is selected
export function CloudTenantLedgersIndex() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[--foreground] mb-6">Ledgers</h1>
      <p className="text-[--muted-foreground]">Select a ledger from the list or create a new one.</p>
    </div>
  );
}
