import { useContext } from "react";
import { useForm } from "react-hook-form";
import { Form, Link, useParams } from "react-router-dom";
import { AppContext } from "../../../../app-context.js";
import { Button } from "../../../../components/Button.tsx";
import { ledgerName, tenantName } from "../../../../helpers.ts";

type LedgerFormData = {
  ledgerName: string;
  ledgerId: string;
  tenantId: string;
};

export function LedgerAdmin() {
  const { ledgerId } = useParams();
  const { cloud } = useContext(AppContext);
  const listLedgers = cloud.getListLedgersByUser();
  const updateLedgerMutation = cloud.updateLedgerMutation();

  const { register, handleSubmit } = useForm<LedgerFormData>();

  if (listLedgers.isPending) {
    return <div>Loading...</div>;
  }
  if (!listLedgers.data) {
    return <div>Not found</div>;
  }

  const ledger = listLedgers.data.ledgers.find((t) => t.ledgerId === ledgerId);
  if (!ledger) {
    return <div>Not found</div>;
  }

  function onSubmitTenant(data: LedgerFormData) {
    updateLedgerMutation.mutate({
      ledgerId: data.ledgerId,
      tenantId: data.tenantId,
      name: data.ledgerName,
    });
  }

  console.log("ledger", ledger, `/fp/cloud/tenants/${ledger.tenantId}/ledgers/${ledger.ledgerId}/delete`);

  return (
    <div className="p-6">
      <div className="space-y-6">
        {/* Tenant Name Update */}
        <div className="bg-[--muted] shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-[--foreground] mb-4">Update Tenant Name</h3>
            <Form onSubmit={handleSubmit(onSubmitTenant)} className="space-y-4">
              <div>
                <label htmlFor="ledgerName" className="block text-sm font-medium text-[--muted-foreground] mb-1">
                  Current Name: {ledgerName(ledger)}
                </label>
                <div className="flex gap-2">
                  <input
                    id="ledgerName"
                    defaultValue={ledger.name}
                    {...register("ledgerName", { required: true })}
                    type="text"
                    className="flex-1 py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent"
                  />
                  <input type="hidden" {...register("ledgerId", { required: true })} value={ledger.ledgerId} />
                  <input type="hidden" {...register("tenantId", { required: true })} value={ledger.tenantId} />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[--accent] text-[--accent-foreground] rounded hover:bg-[--accent]/80"
                  >
                    Update Name
                  </button>
                </div>
              </div>
            </Form>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-[--destructive]/10 shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-[--destructive] mb-4">Danger Zone</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[--muted-foreground]">
                  Once you delete a ledger/database, there is no going back. Please be certain.
                </p>
              </div>
              <Link to={`/fp/cloud/tenants/${ledger.tenantId}/ledgers/${ledger.ledgerId}/delete`}>
                to={`/fp/cloud/tenants/${ledger.tenantId}/ledgers/${ledger.ledgerId}/delete`}
                <Button variation="destructive">Delete Database</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
