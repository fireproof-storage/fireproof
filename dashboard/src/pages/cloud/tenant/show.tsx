import { Form, Link, SubmitTarget, useParams } from "react-router-dom";
import { tenantName } from "../../../hooks/tenant.ts";
import { useContext } from "react";
import { AppContext } from "../../../app-context.tsx";
import { useForm } from "react-hook-form";
import { CloudContext } from "../../../cloud-context.ts";
import { InUpdateTenantParams, ReqUpdateUserTenant } from "../../../../backend/api.ts";

function onSubmitTenant(cloud: CloudContext, tenantId: string, refresh: () => void) {
  return async (data: SubmitTarget) => {
    if (!data) {
      return;
    }
    const tenant = {
      ...(data as unknown as InUpdateTenantParams),
      name: (data as { tenantName: string }).tenantName,
    } as unknown as InUpdateTenantParams;
    console.log("submit", data);
    if (tenantId !== tenant.tenantId) {
      console.error("tenantId mismatch", tenantId, tenant.tenantId);
      return;
    }
    const res = await cloud.api.updateTenant({
      tenant,
    });
    if (res.isErr()) {
      console.error(res.Err());
      return;
    }
    console.log("tenant", res.Ok());
    refresh();
  };

  // submit(data, {
  //   method: "post",
  //   action: ".",
  //   encType: "application/json",
  // });
}

function onSubmitUserTenant(cloud: CloudContext, tenantId: string, refresh: () => void) {
  return async (data: SubmitTarget) => {
    if (!data) {
      return;
    }
    console.log("submit", data);
    const my = data as unknown as ReqUpdateUserTenant & { userName: string };
    if (tenantId !== my.tenantId) {
      console.error("tenantId mismatch", tenantId, my.tenantId);
      return;
    }
    const res = await cloud.api.updateUserTenant({
      tenantId: my.tenantId,
      name: my.userName,
    });
    if (res.isErr()) {
      console.error(res.Err());
      return;
    }
    console.log("tenant", res.Ok());
    refresh();
  };

  // submit(data, {
  //   method: "post",
  //   action: ".",
  //   encType: "application/json",
  // });
}

export function CloudTenantShow() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const { val: listTenants, refresh } = cloud.useListTenantsByUser("tenantShow");
  console.log("CloudTenantShow - listTenants", listTenants);
  const tenants = listTenants.tenants.filter((t) => t.tenantId === tenantId);
  const { register, handleSubmit } = useForm();
  const tenant = tenants[0];
  if (!tenant) {
    return <div>Not found: {tenantId}</div>;
  }
  return (
    <div>
      <h1>{tenantName(tenant)}</h1>

      <p>
        {tenant.tenantId}
        <Link
          data-id="15"
          className="inline-flex h-8 items-center justify-center rounded bg-[--accent] px-3 text-accent-foreground transition-colors hover:bg-[--accent]/80"
          to={`/fp/cloud/${tenant.tenantId}/delete`}
        >
          <svg
            data-id="3"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M5 12h14"></path>
            {/* <path d="M12 5v14"></path> */}
          </svg>
        </Link>
      </p>

      <div className="bg-[--muted] shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-[--foreground]">New Tenant Name:</h3>

          <Form onSubmit={handleSubmit(onSubmitTenant(cloud, tenant.tenantId, refresh))} className="mt-5 sm:flex sm:items-center">
            <div className="w-full sm:max-w-xs">
              <label htmlFor="name">Tenant Name [{tenant.tenant.name}]</label>
              <input
                id="tenantName"
                defaultValue={tenant.tenant.name}
                {...register("tenantName", { required: true })}
                type="text"
                autoFocus
                className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
              />
              <input
                id="tenantId"
                {...register("tenantId", { required: true })}
                type="hidden"
                value={tenant.tenantId}
                autoFocus
                className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
              />
            </div>
            <button
              type="submit"
              className="mt-3 inline-flex w-full items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-[--accent]/80 transition-colors sm:ml-3 sm:mt-0 sm:w-auto"
            >
              Change
            </button>
          </Form>

          <Form
            onSubmit={handleSubmit(onSubmitUserTenant(cloud, tenant.tenantId, refresh))}
            className="mt-5 sm:flex sm:items-center"
          >
            <div className="w-full sm:max-w-xs">
              <label htmlFor="name">Users Tenant Name</label>
              <input
                id="userName"
                defaultValue={tenant.user.name}
                {...register("userName", { required: true })}
                type="text"
                autoFocus
                className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
              />
              <input
                id="tenantId"
                {...register("tenantId", { required: true })}
                type="hidden"
                value={tenant.tenantId}
                autoFocus
                className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
              />
              <input
                id="userId"
                {...register("userId", { required: true })}
                type="hidden"
                value={listTenants.userId}
                autoFocus
                className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
              />
            </div>
            <button
              type="submit"
              className="mt-3 inline-flex w-full items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-[--accent]/80 transition-colors sm:ml-3 sm:mt-0 sm:w-auto"
            >
              Change
            </button>
          </Form>
        </div>
      </div>

      <pre>{JSON.stringify(tenant, null, 2)}</pre>

      <p>{listTenants.authUserId}</p>
      <p>{listTenants.userId}</p>
    </div>
  );
}
