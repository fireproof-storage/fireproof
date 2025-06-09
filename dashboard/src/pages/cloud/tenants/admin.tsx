import { useContext } from "react";
import { useForm } from "react-hook-form";
import { Form, Link, useParams } from "react-router-dom";
import { AppContext } from "../../../app-context.js";
import { Button } from "../../../components/Button.tsx";
import { tenantName } from "../../../helpers.ts";

type TenantFormData = {
  tenantName: string;
  tenantId: string;
};

export function CloudTenantAdmin() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const listTenants = cloud.getListTenantsByUser();
  const updateTenantMutation = cloud.updateTenantMutation();

  const { register, handleSubmit } = useForm<TenantFormData>();

  if (listTenants.isPending) {
    return <div>Loading...</div>;
  }
  if (!listTenants.data) {
    return <div>Not found</div>;
  }

  const tenant = listTenants.data.tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    return <div>Not found</div>;
  }

  function onSubmitTenant(data: TenantFormData) {
    console.log("updateTenant", data);
    updateTenantMutation.mutate({
      tenantId: data.tenantId,
      name: data.tenantName,
    });
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        {/* Tenant Name Update */}
        <div className="bg-[--muted] shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-[--foreground] mb-4">Update Tenant Name</h3>
            <Form onSubmit={handleSubmit(onSubmitTenant)} className="space-y-4">
              <div>
                <label htmlFor="tenantName" className="block text-sm font-medium text-[--muted-foreground] mb-1">
                  Current Name: {tenantName(tenant)}
                </label>
                <div className="flex gap-2">
                  <input
                    id="tenantName"
                    defaultValue={tenant.tenant.name}
                    {...register("tenantName", { required: true })}
                    type="text"
                    className="flex-1 py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent"
                  />
                  <input type="hidden" {...register("tenantId", { required: true })} value={tenant.tenantId} />
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
                  Once you delete a tenant, there is no going back. Please be certain.
                </p>
              </div>
              <Link to={`/fp/cloud/tenants/${tenant.tenantId}/delete`}>
                <Button variation="destructive">Delete Tenant</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
