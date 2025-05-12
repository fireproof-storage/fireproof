import { Link, redirect, useNavigate, useParams } from "react-router-dom";
import { AppContext } from "../../../../app-context.tsx";
import { useContext } from "react";
import { CloudContext } from "../../../../cloud-context.ts";

export function LedgerDelete() {
  const { tenantId, ledgerId } = useParams();
  const { cloud } = useContext(AppContext);

  const { refetch, data } = cloud.getListLedgersByUser();
  const navigate = useNavigate();

  console.log("delete, ledgerId", ledgerId, tenantId);
  const ledger = data?.ledgers.find((t) => t.tenantId === tenantId && t.ledgerId === ledgerId);
  if (!ledger) {
    return <h1>Not found</h1>;
  }

  async function deleteLedgerAction(ctx: CloudContext, tenantId?: string, ledgerId?: string) {
    if (tenantId && ledgerId) {
      const res = await ctx.api.deleteLedger({ ledger: { tenantId, ledgerId } });
      console.log("deleted", tenantId, ledgerId, res);
      refetch();
      navigate(`/fp/cloud`);
    }
  }
  return (
    <h1>
      <Link
        to={`/fp/cloud`}
        onClick={(e) => {
          e.preventDefault();
          deleteLedgerAction(cloud, tenantId, ledgerId);
        }}
      >
        Delete {ledgerId} -- {ledger.name}
      </Link>
    </h1>
  );
}
