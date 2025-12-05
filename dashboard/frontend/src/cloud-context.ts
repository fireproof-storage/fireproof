import { Result } from "@adviser/cement";
import { useClerk, useSession } from "@clerk/clerk-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ResCloudSessionToken,
  ResCreateLedger,
  ResCreateTenant,
  ResEnsureUser,
  ResListInvites,
  ResListLedgersByUser,
  ResListTenantsByUser,
  ResUpdateLedger,
  ResUpdateTenant,
  InviteTicket,
  clerkDashApi,
} from "@fireproof/core-protocols-dashboard";
import { DASHAPI_URL } from "./helpers.js";
import { Clerk } from "@clerk/clerk-js";

export interface InviteItem {
  tenantId: string;
  invites: InviteTicket[];
}

function wrapResultToPromise<T>(pro: () => Promise<Result<T>>) {
  return async (): Promise<T> => {
    // console.log("wrapResultToPromise-pre", pro);
    const res = await pro();
    // console.log("wrapResultToPromise-post", pro);
    if (res.isOk()) {
      return res.Ok();
    }
    throw res.Err();
  };
}

export interface ListTenantsLedgersByUser {
  readonly tenant: ResListTenantsByUser["tenants"][number];
  readonly ledgers: ResListLedgersByUser["ledgers"];
}

export class CloudContext {
  dashApi!: ReturnType<typeof clerkDashApi>;

  _clerkSession?: ReturnType<typeof useSession>;

  sessionReady(condition: boolean) {
    const ret = this._clerkSession?.isLoaded && this._clerkSession?.isSignedIn /*|| !!this._betterAuthSession?.data*/ && condition;
    // console.log("sessionReady", ret);
    return ret;
  }

  activeApi(condition = true) {
    const x = this.sessionReady(this._ensureUser.data?.user.status === "active" && condition);
    // console.log("activeApi", x);
    return x;
  }

  initContext() {
    const clerk = useClerk() as Clerk;
    this.dashApi = clerkDashApi(clerk, { apiUrl: DASHAPI_URL });
    this._clerkSession = useSession();
    this._ensureUser = useQuery({
      queryKey: ["ensureUser"],
      queryFn: wrapResultToPromise(() => this.dashApi.ensureUser({})),
      enabled: this.sessionReady(true),
    });
  }

  _ensureUser!: ReturnType<typeof useQuery<ResEnsureUser, []>>;
  // _listTenantsByUser!: ReturnType<typeof useRequest<ResListTenantsByUser, []>>
  _tenantsForInvites = new Set<string>();
  getListInvitesByTenant(tenantId: string): ReturnType<typeof useQuery<ResListInvites>> {
    const listInvites = useQuery({
      queryKey: ["listInvitesTenants", this._ensureUser.data?.user.userId],
      queryFn: wrapResultToPromise(() =>
        this.dashApi.listInvites({
          tenantIds: Array.from(this._tenantsForInvites),
        }),
      ),
      enabled: this.activeApi(this._tenantsForInvites.size > 0),
    });
    if (!this._tenantsForInvites.has(tenantId)) {
      this._tenantsForInvites.add(tenantId);
      if (this.activeApi(this._tenantsForInvites.size > 0)) {
        listInvites.refetch();
      }
    }
    return listInvites;
  }

  _tenantIdForLedgers = new Set<string>();

  addTenantToListLedgerByUser(tenantId: string | undefined, action?: () => void) {
    if (tenantId && !this._tenantIdForLedgers.has(tenantId)) {
      this._tenantIdForLedgers.add(tenantId);
      // console.log("addTenantToListLedgerByUser", tenantId, action);
      action?.();
    }
  }

  getListLedgersByUser(tenantId?: string): ReturnType<typeof useQuery<ResListLedgersByUser>> {
    // this.activeApi(this._tenantIdForLedgers.size > 0) && console.log("active getListLedgersByUser", tenantId);
    const listLedgers = useQuery({
      queryKey: ["listLedgersByUser", this._ensureUser.data?.user.userId],
      queryFn: wrapResultToPromise(() => this.dashApi.listLedgersByUser({ tenantIds: Array.from(this._tenantIdForLedgers) })),
      enabled: this.activeApi(this._tenantIdForLedgers.size > 0),
    });

    this.addTenantToListLedgerByUser(tenantId, () => {
      // console.log("ledger - refetch", tenantId, this.activeApi(this._tenantIdForLedgers.size > 0));
      if (this.activeApi(this._tenantIdForLedgers.size > 0)) {
        listLedgers.refetch();
      }
    });
    return listLedgers;
  }

  getListTenantsLedgersByUser(): ReturnType<typeof useQuery<ListTenantsLedgersByUser[]>> {
    return useQuery({
      queryKey: ["listTenantsLedgersByUser", this._ensureUser.data?.user.userId],
      queryFn: async () => {
        // console.log("useListTenantsByUser", this._ensureUser.data?.user.userId);
        const listTenantsByUser = await this.dashApi.listTenantsByUser({});
        const listLedgersByUser = await this.dashApi.listLedgersByUser({
          tenantIds: listTenantsByUser.Ok().tenants.map((t) => t.tenantId),
        });
        return listTenantsByUser
          .Ok()
          .tenants.map((tenant) => ({
            tenant,
            ledgers: listLedgersByUser
              .Ok()
              .ledgers.filter((ledger) => ledger.tenantId === tenant.tenantId)
              .sort((a, b) => a.name.localeCompare(b.name)),
          }))
          .sort((a, b) => a.tenant.tenant.name?.localeCompare(b.tenant.tenant.name || "") || 0);
      },
      enabled: this.activeApi(),
    });
  }

  getListTenantsByUser(): ReturnType<typeof useQuery<ResListTenantsByUser>> {
    return useQuery({
      queryKey: ["listTenantsByUser", this._ensureUser.data?.user.userId],
      queryFn: () => {
        // console.log("useListTenantsByUser", this._ensureUser.data?.user.userId);
        return wrapResultToPromise(() => this.dashApi.listTenantsByUser({}))();
      },
      enabled: this.activeApi(),
    });
  }

  getCloudToken(): ReturnType<typeof useQuery<ResCloudSessionToken>> {
    return useQuery({
      queryKey: [this._ensureUser.data?.user.userId],
      queryFn: () => {
        // console.log("getCloudSessionToken", this._ensureUser.data?.user.userId);
        return wrapResultToPromise(() => this.dashApi.getCloudSessionToken({}))();
      },
      enabled: this.activeApi(),
    });
  }

  // getListLedgersByTenant(tenantId: string): ReturnType<typeof useQuery<ResListLedgers>> {
  //   return useQuery({
  //     queryKey: ["listLedgersByTenant", tenantId, this._ensureUser.data?.user.userId],
  //     queryFn: wrapResultToPromise(this.dashApi.listLedgersByUser({ tenantIds: [tenantId] })),
  //     enabled: this.activeApi(),
  //   });
  // }

  createTenantMutation(): ReturnType<typeof useMutation<ResCreateTenant, Error, { name: string }>> {
    const listTenantsByUser = this.getListTenantsByUser();
    return useMutation({
      mutationFn: ({ name }: { name: string }) => {
        return wrapResultToPromise(() => this.dashApi.createTenant({ tenant: { name } }))();
      },
      onSuccess: async () => {
        // console.log("onSuccess", data, variables, context);
        listTenantsByUser.refetch();
      },
    });
  }

  createLedgerMutation(): ReturnType<typeof useMutation<ResCreateLedger, Error, { name: string; tenantId: string }>> {
    const listLedgers = this.getListLedgersByUser();
    return useMutation({
      mutationFn: ({ name, tenantId }: { name: string; tenantId: string }) => {
        return wrapResultToPromise(() =>
          this.dashApi.createLedger({
            ledger: {
              name,
              tenantId,
            },
          }),
        )();
      },
      onSuccess: async (_data, variables, _context) => {
        this.addTenantToListLedgerByUser(variables.tenantId, () => {
          listLedgers.refetch();
        });
        listLedgers.refetch();
      },
    });
  }

  updateTenantMutation(): ReturnType<typeof useMutation<ResUpdateTenant, Error, { tenantId: string; name: string }>> {
    const listTenants = this.getListTenantsByUser();
    return useMutation({
      mutationFn: ({ tenantId, name }: { tenantId: string; name: string }) => {
        return wrapResultToPromise(() =>
          this.dashApi.updateTenant({
            tenant: { tenantId, name },
          }),
        )();
      },
      onSuccess: () => {
        listTenants.refetch();
      },
    });
  }

  updateLedgerMutation(): ReturnType<
    typeof useMutation<ResUpdateLedger, Error, { ledgerId: string; tenantId: string; name: string }>
  > {
    const listLedgers = this.getListLedgersByUser();
    return useMutation({
      mutationFn: ({ tenantId, ledgerId, name }: { tenantId: string; ledgerId: string; name: string }) => {
        return wrapResultToPromise(() =>
          this.dashApi.updateLedger({
            ledger: { ledgerId, tenantId, name },
          }),
        )();
      },
      onSuccess: () => {
        listLedgers.refetch();
      },
    });
  }
}
