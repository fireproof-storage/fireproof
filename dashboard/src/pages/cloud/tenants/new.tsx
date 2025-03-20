import { useContext } from "react";
import type { FieldValues } from "react-hook-form";
import { useForm } from "react-hook-form";
import { redirect, useNavigate } from "react-router-dom";
import type { AppContextType } from "../../../app-context.tsx";
import { AppContext } from "../../../app-context.tsx";
import { Button } from "../../../components/Button.tsx";

export function newCloudAction(ctx: AppContextType) {
  return async ({ request }: { request: Request }) => {
    const tenantName = (await request.json()).tenantName;
    const rTenant = await ctx.cloud.api.createTenant({
      tenant: {
        name: tenantName,
      },
    });
    console.log("created", rTenant);
    if (rTenant.isErr()) {
      return new Response(rTenant.Err().message, { status: 400 });
    }
    // const { refresh } = ctx.cloud.useListTenantsByUser();
    // refresh();
    return redirect(`/fp/cloud/tenants/${rTenant.Ok().tenant.tenantId}/overview`);
  };
}

export function CloudNew() {
  const ctx = useContext(AppContext);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const createTenant = ctx.cloud.createTenantMutation();

  async function onSubmit(data: FieldValues): Promise<void> {
    try {
      const rTenant = await createTenant.mutateAsync({ name: data.tenantName });
      navigate(`/fp/cloud/tenants/${rTenant.tenant.tenantId}/overview`);
    } catch (error) {
      console.error("Failed to create tenant:", error);
    }
  }

  return (
    <div className="max-w-2xl">
      <h3 className="text-fp-p text-20">New Tenant Name:</h3>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 sm:flex">
        <div className="w-full sm:max-w-xs">
          <label htmlFor="tenantName" className="sr-only">
            Tenant Name
          </label>
          <input
            id="tenantName"
            type="text"
            {...register("tenantName", {
              required: "Name is required",
            })}
            className="w-full py-2 px-3 bg-fp-bg-00 border border-fp-dec-00 rounded-fp-s text-14 text-fp-p placeholder-fp-dec-02 focus:placeholder-transparent focus:outline-none focus:ring-1 focus:ring-fp-dec-02 focus:border-transparent"
            disabled={createTenant.isPending}
            autoComplete="off"
            data-1p-ignore
            placeholder="Enter tenant name"
          />
        </div>
        <Button
          variation="primary"
          style="w-full mt-[14px] sm:ml-3 sm:mt-0 sm:w-auto"
          type="submit"
          disabled={createTenant.isPending}
        >
          Create
        </Button>
        <Button variation="secondary" style="w-full mt-[14px] sm:ml-3 sm:mt-0 sm:w-auto" type="button" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </form>
      {errors.tenantName && <p className="mt-1 text-sm text-red-500">{errors.tenantName.message as string}</p>}
    </div>
  );
}
