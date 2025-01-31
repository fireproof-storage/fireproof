import { useContext } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { AppContext } from "../../../../app-context.js";

export function CloudTenantLedgersNew() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm();
  const createLedger = cloud.createLedgerMutation();

  const onSubmit = async (data: { name: string }) => {
    if (!tenantId) return;

    try {
      const resp = await createLedger.mutateAsync({
        name: data.name,
        tenantId
      });
      
      navigate(`/fp/cloud/tenants/${tenantId}/ledgers/${resp.ledger.ledgerId}`);
    } catch (error) {
      console.error('Failed to create ledger:', error);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[--foreground] mb-6">Create New Ledger</h1>
      
      <div className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[--muted-foreground] mb-1">
              Ledger Name
            </label>
            <input
              id="name"
              type="text"
              {...register("name", { 
                required: "Name is required",
                minLength: { value: 3, message: "Name must be at least 3 characters" }
              })}
              className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent"
              placeholder="Enter ledger name"
              disabled={createLedger.isPending}
              autoFocus
            />
            {errors.name && (
              <p className="mt-1 text-sm text-[--destructive]">{errors.name.message as string}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate(`/fp/cloud/tenants/${tenantId}/ledgers`)}
              className="px-4 py-2 bg-[--muted] text-[--muted-foreground] rounded hover:bg-[--muted]/80"
              disabled={createLedger.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[--accent] text-[--accent-foreground] rounded hover:bg-[--accent]/80"
              disabled={createLedger.isPending}
            >
              {createLedger.isPending ? 'Creating...' : 'Create Ledger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 