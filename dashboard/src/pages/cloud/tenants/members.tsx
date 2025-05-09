import { useContext, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import { AppContext } from "../../../app-context.js";
import { Minus } from "../../../components/Minus.js";
import { Plus } from "../../../components/Plus.js";

import { ps } from "@fireproof/core";

const reEmail =
  /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

export function CloudTenantMembers() {
  const { tenantId } = useParams();
  const { cloud } = useContext(AppContext);
  const listTenants = cloud.getListTenantsByUser();

  if (listTenants.isPending) {
    return <div>Loading...</div>;
  }
  if (!listTenants.data) {
    // navigate("/fp/cloud");
    return <div>Not found</div>;
  }

  const tenant = listTenants.data.tenants.find((t) => t.tenantId === tenantId);

  if (!tenant) {
    return <div>Not found</div>;
  }

  if (!ps.dashboard.isAdmin(tenant)) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[--foreground] mb-6">Members</h1>
        <p className="text-[--muted-foreground]">You need admin privileges to manage members.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        <InviteMembers tenant={tenant} userId={listTenants.data.userId} />
        <CurrentInvites tenant={tenant} />
      </div>
    </div>
  );
}

function InviteMembers({ tenant, userId }: { tenant: ps.dashboard.UserTenant; userId: string }) {
  const { cloud } = useContext(AppContext);
  const [queryResult, setQueryResult] = useState<ps.dashboard.ResFindUser>({
    type: "resFindUser",
    query: {},
    results: [],
  });
  const { register } = useForm();
  const [queryValue, setQueryValue] = useState("");
  const listInvites = cloud.getListInvitesByTenant(tenant.tenantId);

  async function queryExistingUserOrNick(e: React.ChangeEvent<HTMLInputElement>) {
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

  function addInvite(tenant: ps.dashboard.UserTenant, user: ps.dashboard.User) {
    return async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();
      let query: ps.dashboard.QueryUser;
      if (user.byProviders[0]?.queryProvider === "invite-per-email") {
        query = {
          byEmail: user.byProviders[0].cleanEmail,
        };
      } else {
        query = {
          existingUserId: user.userId,
        };
      }
      const res = await cloud.api.inviteUser({
        ticket: {
          invitedParams: {
            tenant: {
              id: tenant.tenantId,
              role: "admin",
            },
          },
          query,
        },
      });
      if (res.isErr()) {
        console.error(res.Err());
        return;
      }
      setQueryValue("");
      setQueryResult({
        type: "resFindUser",
        query: {},
        results: [],
      });
      // Refresh the invite list after adding a new invite
      listInvites.refetch();
    };
  }

  return (
    <div className="bg-[--muted] shadow sm:rounded-lg p-6">
      <h2 className="text-lg font-semibold text-[--foreground] mb-4">Invite New Members</h2>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-4">
          <div>
            <label htmlFor="EmailOrNick" className="block text-sm font-medium text-[--muted-foreground] mb-1">
              Search by email or username
            </label>
            <input
              className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent"
              type="text"
              id="EmailOrNick"
              placeholder="Enter email or username"
              value={queryValue}
              {...register("EmailOrNick", {
                onChange: queryExistingUserOrNick,
              })}
            />
          </div>

          {(queryResult.results.length > 0 || reEmail.test(queryValue)) && (
            <div className="bg-[--background] rounded-md p-4">
              <h3 className="text-sm font-medium text-[--foreground] mb-2">Search Results</h3>
              <ul className="space-y-2">
                {queryResult.results
                  .filter((i) => i.userId !== userId)
                  .map((user) => (
                    <li key={user.userId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {user.byProviders[0].params.image_url && (
                          <img
                            src={user.byProviders[0].params.image_url}
                            className="w-8 h-8 rounded-full"
                            alt={user.byProviders[0].cleanEmail}
                          />
                        )}
                        <span className="text-sm text-[--foreground]">
                          {user.byProviders[0].queryProvider}[{user.byProviders[0].cleanEmail}]
                        </span>
                      </div>
                      <button type="button" onClick={addInvite(tenant, user)} className="p-1 hover:bg-[--accent]/10 rounded">
                        <Plus />
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function CurrentInvites({ tenant }: { tenant: ps.dashboard.UserTenant }) {
  const { cloud } = useContext(AppContext);
  const listInvites = cloud.getListInvitesByTenant(tenant.tenantId);

  if (listInvites.isPending) {
    return <div>Loading...</div>;
  }
  if (!listInvites.data) {
    return <div>Not found</div>;
  }

  function handleRemoveInvite(inviteId: string) {
    return async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault();
      const res = await cloud.api.deleteInvite({ inviteId });
      if (res.isErr()) {
        console.error(res.Err());
        return;
      }
      listInvites.refetch();
    };
  }

  return (
    <div className="bg-[--muted] shadow sm:rounded-lg p-6">
      <h2 className="text-lg font-semibold text-[--foreground] mb-4">Pending Invites</h2>
      {listInvites.data.tickets.length === 0 ? (
        <p className="text-[--muted-foreground]">No pending invites</p>
      ) : (
        <ul className="divide-y divide-[--border]">
          {listInvites.data.tickets.map((ticket) => {
            const email = ticket.query.byEmail || "Unknown email";
            const status =
              ticket.status === "pending" ? (
                <span className="text-xs px-2 py-1 bg-[--accent]/10 text-[--accent] rounded">Pending</span>
              ) : (
                <span className="text-xs px-2 py-1 bg-[--muted-foreground]/10 text-[--muted-foreground] rounded">
                  {ticket.status}
                </span>
              );

            return (
              <li key={ticket.inviteId} className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[--foreground]">{email}</span>
                    {status}
                  </div>
                  {ticket.invitedUserId && <span className="text-xs text-[--muted-foreground]">ID: {ticket.invitedUserId}</span>}
                </div>
                {ticket.status === "pending" && (
                  <button
                    type="button"
                    onClick={handleRemoveInvite(ticket.inviteId)}
                    className="p-1 hover:bg-[--destructive]/10 rounded text-[--destructive]"
                    aria-label="Remove invite"
                  >
                    <Minus />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
