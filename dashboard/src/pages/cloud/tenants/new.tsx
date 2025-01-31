import { useContext } from "react";
import { useForm } from "react-hook-form";
import { Form, SubmitTarget, redirect, useNavigate } from "react-router-dom";
import { AppContext, AppContextType } from "../../../app-context.tsx";

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
  // const submit = useSubmit();
  const { register, handleSubmit } = useForm();

  const ctx = useContext(AppContext);
  // const { refetch } = ctx.cloud.getListTenantsByUser();

  const navigate = useNavigate();
  // const submit = useSubmit();

  const createTenant = ctx.cloud.createTenantMutation();

  async function onSubmit(data: SubmitTarget) {
    const { tenantName } = data as { tenantName: string }; // (await request.json()).tenantName;
    const rTenant = await createTenant.mutateAsync({ name: tenantName });
    navigate(`/fp/cloud/tenants/${rTenant.tenant.tenantId}/overview`);
  }

  return (
    <div className="bg-[--muted] shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-base font-semibold leading-6 text-[--foreground]">New Tenant Name:</h3>

        <Form onSubmit={handleSubmit(onSubmit)} className="mt-5 sm:flex sm:items-center">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="tenantName" className="sr-only">
              Tenant Name
            </label>
            <input
              id="tenantName"
              {...register("tenantName", { required: true })}
              type="text"
              placeholder="New Tenant name"
              autoFocus
              className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
            />
          </div>
          <div className="mt-3 sm:ml-3 sm:mt-0 flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-[--accent]/80 transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center rounded bg-[--muted-foreground] px-3 py-2 text-sm font-semibold text-[--background] shadow-sm hover:bg-[--muted-foreground]/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
