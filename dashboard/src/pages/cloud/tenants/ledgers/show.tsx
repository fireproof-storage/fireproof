import { useState } from "react";
import { useParams } from "react-router-dom";

export function CloudTenantLedgersShow() {
  const { ledgerId } = useParams();
  const [activeTab, setActiveTab] = useState("quickstart");

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="border-b border-[--border]">
          <nav className="flex" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setActiveTab("quickstart")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === "quickstart"
                  ? "border-[--accent] text-[--accent]"
                  : "border-transparent text-[--muted-foreground] hover:text-[--foreground] hover:border-[--border]"
              }`}
            >
              Quickstart
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("documents")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === "documents"
                  ? "border-[--accent] text-[--accent]"
                  : "border-transparent text-[--muted-foreground] hover:text-[--foreground] hover:border-[--border]"
              }`}
            >
              Documents
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sharing")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === "sharing"
                  ? "border-[--accent] text-[--accent]"
                  : "border-transparent text-[--muted-foreground] hover:text-[--foreground] hover:border-[--border]"
              }`}
            >
              Sharing
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "quickstart" && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Quickstart Guide</h2>
              <p className="text-[--muted-foreground]">
                Connect to ledger <code className="text-[--foreground]">{ledgerId}</code>
              </p>
            </div>
          )}
          {activeTab === "documents" && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Documents</h2>
              <p className="text-[--muted-foreground]">Manage your ledger documents here.</p>
            </div>
          )}
          {activeTab === "sharing" && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Sharing Settings</h2>
              <p className="text-[--muted-foreground]">Control who has access to your ledger.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
