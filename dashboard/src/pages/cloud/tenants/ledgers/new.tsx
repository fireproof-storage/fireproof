import { useContext } from "react";
import type { FieldValues } from "react-hook-form";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { AppContext } from "../../../../app-context.js";
import { Button } from "../../../../components/Button.tsx";

export function CloudTenantLedgersNew() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const createLedger = cloud.createLedgerMutation();

  async function onSubmit(data: FieldValues): Promise<void> {
    if (!tenantId) return;
    try {
      const resp = await createLedger.mutateAsync({
        name: data.name,
        tenantId,
      });

      navigate(`/fp/cloud/tenants/${tenantId}/ledgers/${resp.ledger.ledgerId}`);
    } catch (error) {
      console.error("Failed to create ledger:", error);
    }
  }

  return (
    <div className="max-w-2xl">
      <h3 className="text-fp-p text-20">New Database Name:</h3>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 sm:flex">
        <div className="w-full sm:max-w-xs">
          <label htmlFor="name" className="sr-only">
            Database Name
          </label>
          <input
            id="name"
            type="text"
            {...register("name", {
              required: "Name is required",
              minLength: { value: 3, message: "Name must be at least 3 characters" },
            })}
            className="w-full m-[1px] py-2 px-3 bg-fp-bg-00 border border-fp-dec-00 rounded-fp-s text-14 text-fp-p placeholder-fp-dec-02 focus:placeholder-transparent focus:outline-none focus:ring-1 focus:ring-fp-dec-02 focus:border-transparent"
            disabled={createLedger.isPending}
            autoFocus
            autoComplete="off"
            data-1p-ignore
            placeholder="Enter database name"
          />
        </div>
        <Button
          variation="primary"
          style="w-full mt-[14px] sm:ml-3 sm:mt-0 sm:w-auto"
          type="submit"
          disabled={createLedger.isPending}
        >
          Create
        </Button>
      </form>
      {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name.message as string}</p>}
    </div>
  );
}
