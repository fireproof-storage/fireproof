import { useParams } from "react-router-dom";

/**
 * Component for managing ledger sharing and access control
 */
export function LedgerSharing() {
  const { ledgerId } = useParams();
  return (
    <div>
      <p className="text-[--muted-foreground]">Control who has access to your ledger.</p>
    </div>
  );
}
