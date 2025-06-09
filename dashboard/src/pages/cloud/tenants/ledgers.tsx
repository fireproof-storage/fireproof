import { Outlet } from "react-router-dom";

export function CloudTenantLedgers() {
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

export function CloudTenantLedgersIndex() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[--foreground] mb-6">Databases</h1>
      <p className="text-[--muted-foreground]">Select a database from the sidebar or create a new one.</p>
    </div>
  );
}
