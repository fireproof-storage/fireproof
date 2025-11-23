import { Result } from "@adviser/cement";
import { useSession } from "@clerk/clerk-react";
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
  DashboardApi,
  // UserTenant,
} from "@fireproof/core-protocols-dashboard";
import { DASHAPI_URL } from "./helpers.js";

// const emptyListTenantsByUser: ResListTenantsByUser = {
//   type: "resListTenantsByUser",
//   userId: "unk",
//   authUserId: "unk",
//   tenants: [] as UserTenant[],
// };

// const emptyListInvites: ResListInvites = {
//   type: "resListInvites",
//   tickets: [],
// };

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

// const _betterAuthClient = createAuthClient({
//   baseURL: API_URL,
// });

interface TokenType {
  readonly type: "clerk" | "better";
  readonly token: string;
}
export interface ListTenantsLedgersByUser {
  readonly tenant: ResListTenantsByUser["tenants"][number];
  readonly ledgers: ResListLedgersByUser["ledgers"];
}

export class CloudContext {
  readonly api: DashboardApi;
  // readonly betterAuthClient: ReturnType<typeof createAuthClient>;

  constructor() {
    // this.betterAuthClient = _betterAuthClient;
    this.api = new DashboardApi({
      apiUrl: DASHAPI_URL,
      fetch: window.fetch.bind(window),
      // apiUrl: API_URL,
      getToken: async () => {
        // console.log("CloudContext getToken");
        const token = await this._clerkSession?.session?.getToken({ template: "with-email" });
        return {
          type: "clerk",
          token: token || "",
        };
      },
    });
  }

  _clerkSession?: ReturnType<typeof useSession>;
  // private _betterAuthSession?: ReturnType<typeof _betterAuthClient.useSession>;
  // private _queryClient?: QueryClient;

  readonly betterToken = {
    expires: -1,
    token: undefined,
  } as {
    expires: number;
    token?: string;
  };
  async getToken(): Promise<TokenType | undefined> {
    // console.log("getToken", this._betterAuthSession?.data);
    // if (this._betterAuthSession?.data) {
    //   if (this.betterToken.expires < Date.now()) {
    //     const res = (await this.betterAuthClient.$fetch("/token")) as {
    //       data: {
    //         token: string;
    //       };
    //     };
    //     this.betterToken.token = res.data.token;
    //     console.log("betterToken", this.betterToken.token);
    //     // jwt.verify(this.betterToken.token
    //     // this.betterToken.expires = Date.now() + this._betterAuthSession.data.expiresIn;
    //   }
    //   if (!this.betterToken.token) {
    //     return undefined;
    //   }
    //   return {
    //     type: "better",
    //     token: this.betterToken.token,
    //   };
    // }
    const token = await this._clerkSession?.session?.getToken({ template: "with-email" });
    return token
      ? {
          type: "clerk",
          token,
        }
      : undefined;
  }

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
    console.log("initContext");

    this._clerkSession = useSession();
    // this._betterAuthSession = _betterAuthClient.useSession();

    this._ensureUser = useQuery({
      queryKey: ["ensureUser"],
      queryFn: wrapResultToPromise(() => this.api.ensureUser({})),
      enabled: this.sessionReady(true),
    });
    // this._tenantIdForLedgers.clear();

    // this._queryClient = useQueryClient();
  }

  _ensureUser!: ReturnType<typeof useQuery<ResEnsureUser, []>>;
  // _listTenantsByUser!: ReturnType<typeof useRequest<ResListTenantsByUser, []>>
  _tenantsForInvites = new Set<string>();
  getListInvitesByTenant(tenantId: string): ReturnType<typeof useQuery<ResListInvites>> {
    const listInvites = useQuery({
      queryKey: ["listInvitesTenants", this._ensureUser.data?.user.userId],
      queryFn: wrapResultToPromise(() =>
        this.api.listInvites({
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
      queryFn: wrapResultToPromise(() => this.api.listLedgersByUser({ tenantIds: Array.from(this._tenantIdForLedgers) })),
      enabled: this.activeApi(this._tenantIdForLedgers.size > 0),
    });

    this.addTenantToListLedgerByUser(tenantId, () => {
      console.log("ledger - refetch", tenantId, this.activeApi(this._tenantIdForLedgers.size > 0));
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
        console.log("useListTenantsByUser", this._ensureUser.data?.user.userId);
        const listTenantsByUser = await this.api.listTenantsByUser({});
        const listLedgersByUser = await this.api.listLedgersByUser({
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
        console.log("useListTenantsByUser", this._ensureUser.data?.user.userId);
        return wrapResultToPromise(() => this.api.listTenantsByUser({}))();
      },
      enabled: this.activeApi(),
    });
  }

  getCloudToken(): ReturnType<typeof useQuery<ResCloudSessionToken>> {
    return useQuery({
      queryKey: [this._ensureUser.data?.user.userId],
      queryFn: () => {
        // console.log("getCloudSessionToken", this._ensureUser.data?.user.userId);
        return wrapResultToPromise(() => this.api.getCloudSessionToken({}))();
      },
      enabled: this.activeApi(),
    });
  }

  // getListLedgersByTenant(tenantId: string): ReturnType<typeof useQuery<ResListLedgers>> {
  //   return useQuery({
  //     queryKey: ["listLedgersByTenant", tenantId, this._ensureUser.data?.user.userId],
  //     queryFn: wrapResultToPromise(this.api.listLedgersByUser({ tenantIds: [tenantId] })),
  //     enabled: this.activeApi(),
  //   });
  // }

  createTenantMutation(): ReturnType<typeof useMutation<ResCreateTenant, Error, { name: string }>> {
    const listTenantsByUser = this.getListTenantsByUser();
    return useMutation({
      mutationFn: ({ name }: { name: string }) => {
        return wrapResultToPromise(() => this.api.createTenant({ tenant: { name } }))();
      },
      onSuccess: async (data, variables, context) => {
        console.log("onSuccess", data, variables, context);
        listTenantsByUser.refetch();
      },
    });
  }

  createLedgerMutation(): ReturnType<typeof useMutation<ResCreateLedger, Error, { name: string; tenantId: string }>> {
    const listLedgers = this.getListLedgersByUser();
    return useMutation({
      mutationFn: ({ name, tenantId }: { name: string; tenantId: string }) => {
        return wrapResultToPromise(() =>
          this.api.createLedger({
            ledger: {
              name,
              tenantId,
            },
          }),
        )();
      },
      onSuccess: async (data, variables, context) => {
        console.log("onSuccess", data, variables, context);
        this.addTenantToListLedgerByUser(variables.tenantId, () => {
          console.log("refetch");
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
          this.api.updateTenant({
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
          this.api.updateLedger({
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
