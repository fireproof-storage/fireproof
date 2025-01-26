import { Form, Link, SubmitTarget, useNavigate, useParams } from "react-router-dom";
import { tenantName } from "../../../hooks/tenant.ts";
import { useContext, useState } from "react";
import { AppContext } from "../../../app-context.tsx";
import { useForm } from "react-hook-form";
import { CloudContext, WithoutTypeAndAuth } from "../../../cloud-context.ts";
import { InUpdateTenantParams, ReqInviteUser, ReqUpdateUserTenant, ResFindUser, UserTenant } from "../../../../backend/api.ts";
import { User } from "../../../../backend/users.ts";
import { Plus } from "../../../components/Plus.tsx";
import { queryEmail, QueryUser } from "../../../../backend/sql-helper.ts";
import { Minus } from "../../../components/Minus.tsx";

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

// function ComponentA({ state }: { state: CloudContext["sharedState"] }) {
//   // const [sharedValue, updateSharedValue] = useSharedState({ a: 0, b: [] });

//   const handleClick = () => {
//     state.set({ a: state.val.a + 1, b: [...state.val.b,  1,2] });
//   };

//   return (
//     <div>
//       <h1>Component A: </h1>
//       <pre>{JSON.stringify(state.val)}</pre>
//       <button onClick={handleClick}>Increment</button>
//       <ul>
//       {state.val.b.map((v, i) => <li key={i}>{v}</li>)}
//       </ul>
//     </div>
//   );
// }

// function ComponentB({ state }: { state: CloudContext["sharedState"] }) {
//   // const [sharedValue, updateSharedValue] = useSharedState({ a: 0, b: []}); // Only need to read the value

//   const handleClick = () => {
//     state.set({ a: state.val.a + 1, b: [...state.val.b,  3,4] });
//   };

//   return (
//     <div>
//       <h1>Component B: </h1>
//       <pre>{JSON.stringify(state.val)}</pre>
//       <button onClick={handleClick}>Increment</button>
//       <ul>
//       {state.val.b.map((v,i) => <li key={i}>{v}</li>)}
//       </ul>
//     </div>
//   );
// }

function isAdmin(ut: UserTenant) {
  return ut.role === "admin" || ut.role === "owner";
}

const reEmail =
  /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

export function CloudTenantShow() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const listTenants = cloud.getListTenantsByUser();
  const { register, handleSubmit } = useForm();
  const navigate = useNavigate();

  // const listLedgers = cloud.useListLedgersByTenant(tenantId);
  if (listTenants.isLoading) {
    return <div>Loading...</div>;
  }
  if (!listTenants.data) {
    // navigate("/fp/cloud");
    return <div>Not found</div>;
  }
  const tenants = listTenants.data.tenants.filter((t) => t.tenantId === tenantId);
  const tenant = tenants?.[0];
  if (!tenant) {
    // navigate("/fp/cloud");
    return <div>Not found</div>;
  }
  return (
    <div>
      <h1>{tenantName(tenant)}</h1>

      <p>
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
        {tenant.tenantId}
      </p>

      <div className="bg-[--muted] shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-[--foreground]">New Tenant Name:</h3>

          <Form
            onSubmit={handleSubmit(onSubmitTenant(cloud, tenant.tenantId, listTenants.refetch))}
            className="mt-5 sm:flex sm:items-center"
          >
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
            onSubmit={handleSubmit(onSubmitUserTenant(cloud, tenant.tenantId, listTenants.refetch))}
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
                value={listTenants.data?.userId}
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

      <Invites tenant={tenant} userId={listTenants.data.userId} />

      <p>{listTenants.data.authUserId}</p>
      <p>{listTenants.data.userId}</p>
    </div>
  );
}

function Invites({ tenant, userId }: { tenant: UserTenant; userId: string }) {
  const cloud = useContext(AppContext).cloud;
  const inviteList = cloud.getListInvitesByTenant(tenant.tenantId);

  const [queryResult, setQueryResult] = useState({
    type: "resFindUser",
    query: {},
    results: [],
  } as ResFindUser);
  const { register } = useForm();
  const [queryValue, setQueryValue] = useState("");

  if (!isAdmin(tenant)) {
    return <> </>;
  }
  if (inviteList.isLoading) {
    return <div>Loading...</div>;
  }
  if (inviteList.isError) {
    return <div>{inviteList.error.message}</div>;
  }

  let inviteItem = inviteList.data?.tickets.find((i) => i.tenantId === tenant.tenantId);
  if (!inviteItem) {
    inviteItem = {
      tenantId: tenant.tenantId,
      invites: [],
    };
  }

  if (queryResult.results.length === 0 && reEmail.test(queryValue)) {
    // add external invite
    const now = new Date();
    queryResult.results.push({
      userId: "external-user",
      maxTenants: 0,
      status: "invited",
      statusReason: "external invite",
      createdAt: now,
      updatedAt: now,
      byProviders: [
        {
          providerUserId: "to-be-determined",
          cleanEmail: queryValue,
          queryEmail: queryEmail(queryValue),
          queryProvider: "invite-per-email",
          params: {
            email: queryValue,
            first: "to-be-determined",
            last: "to-be-determined",
          },
          used: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  }

  async function queryExistingUserOrNick(e: React.ChangeEvent<HTMLInputElement>) {
    // e.preventDefault();
    setQueryValue(e.target.value);
    const res = await cloud.api.findUser({
      query: {
        byString: e.target.value,
      },
    });
    if (res.isErr()) {
      console.error(res.Err());
      return;
    }
    setQueryResult(res.Ok());
  }

  function addInvite(tenant: UserTenant, user: User) {
    return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();
      let query: QueryUser;
      if (user.byProviders[0]?.queryProvider === "invite-per-email") {
        query = {
          byEmail: user.byProviders[0].cleanEmail,
        };
      } else {
        query = {
          existingUserId: user.userId,
        };
      }
      cloud.api
        .inviteUser({
          ticket: {
            inviterTenantId: tenant.tenantId,
            query,
          },
        })
        .then((res) => {
          if (res.isErr()) {
            console.error(res.Err());
            return;
          }
          console.log("addInvite", tenant, user);
          setQueryValue("");
          setQueryResult({
            type: "resFindUser",
            query: {},
            results: [],
          });
          inviteList.refetch();
        });
    };
  }

  function delInvite(inviteId: string) {
    return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();
      cloud.api.deleteInvite({ inviteId }).then((res) => {
        if (res.isErr()) {
          console.error(res.Err());
          return;
        }
        console.log("delInvite", inviteId);
        inviteList.refetch();
      });
    };
  }

  return (
    <>
      <h2>Invites</h2>
      <ul>
        <li key={inviteItem.tenantId}>
          <ul>
            {inviteItem.invites.map((invite, j) => (
              <li key={invite.inviteId} style={{ display: "flex", alignItems: "center" }}>
                <button onClick={delInvite(invite.inviteId)}>
                  <Minus />
                </button>
                <pre>{JSON.stringify(invite, null, 2)}</pre>
              </li>
            ))}
          </ul>
        </li>
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label>query existing user</label>
        <input
          className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
          type="text"
          id="EmailOrNick"
          placeholder="search Email or Nick or Existing User ID"
          value={queryValue}
          {...register("EmailOrNick", {
            onChange: queryExistingUserOrNick,
          })}
        />
      </form>
      <ul>
        {queryResult.results
          .filter((i) => i.userId !== userId)
          .map((user, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center" }}>
              {user.byProviders[0].queryProvider}[{user.byProviders[0].cleanEmail}]
              {user.byProviders[0].params.image_url && <img src={user.byProviders[0].params.image_url} width={64} />}
              <button type="submit" onClick={addInvite(tenant, user)}>
                <Plus />
              </button>
            </li>
          ))}
      </ul>
    </>
  );
}
