import { Result, exception2Result } from "@adviser/cement";
import { useSession } from "@clerk/clerk-react";
import { QueryClient, QueryObserverResult, RefetchOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ReqCloudSessionToken,
  ReqCreateLedger,
  ReqCreateTenant,
  ReqDeleteInvite,
  ReqDeleteLedger,
  ReqDeleteTenant,
  ReqEnsureUser,
  ReqFindUser,
  ReqInviteUser,
  ReqListInvites,
  ReqListLedgersByUser,
  ReqListTenantsByUser,
  ReqRedeemInvite,
  ReqUpdateLedger,
  ReqUpdateTenant,
  ReqUpdateUserTenant,
  ResCloudSessionToken,
  ResCreateLedger,
  ResCreateTenant,
  ResDeleteInvite,
  ResDeleteLedger,
  ResDeleteTenant,
  ResEnsureUser,
  ResFindUser,
  ResInviteUser,
  ResListInvites,
  ResListLedgersByUser,
  ResListTenantsByUser,
  ResRedeemInvite,
  ResUpdateLedger,
  ResUpdateTenant,
  ResUpdateUserTenant,
  UserTenant,
} from "../backend/api.ts";
import { AuthType } from "../backend/users.ts";
import { API_URL } from "./helpers.ts";
import { InviteTicket } from "../backend/invites.ts";

interface TypeString {
  type: string;
}

interface WithType<T extends TypeString> {
  type: T["type"];
}

export type WithoutTypeAndAuth<T> = Omit<T, "type" | "auth">;

const emptyListTenantsByUser: ResListTenantsByUser = {
  type: "resListTenantsByUser",
  userId: "unk",
  authUserId: "unk",
  tenants: [] as UserTenant[],
};

const emptyListInvites: ResListInvites = {
  type: "resListInvites",
  tickets: [],
};

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

export class CloudContext {
  readonly api: CloudApi;
  // readonly betterAuthClient: ReturnType<typeof createAuthClient>;

  constructor() {
    // this.betterAuthClient = _betterAuthClient;
    this.api = new CloudApi(this);
  }

  private _clerkSession?: ReturnType<typeof useSession>;
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
    console.log("sessionReady", ret);
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
      this.activeApi(this._tenantsForInvites.size > 0) && listInvites.refetch();
    }
    return listInvites;
  }

  _tenantIdForLedgers = new Set<string>();

  addTenantToListLedgerByUser(tenantId: string | undefined, action?: () => void) {
    if (tenantId && !this._tenantIdForLedgers.has(tenantId)) {
      this._tenantIdForLedgers.add(tenantId);
      console.log("addTenantToListLedgerByUser", tenantId, action);
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
      this.activeApi(this._tenantIdForLedgers.size > 0) && listLedgers.refetch();
    });
    return listLedgers;
  }

  getListTenantsByUser(): ReturnType<typeof useQuery<ResListTenantsByUser>> {
    return useQuery({
      queryKey: ["listTenandsByUser", this._ensureUser.data?.user.userId],
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
        console.log("getCloudSessionToken", this._ensureUser.data?.user.userId);
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

  createTenantMutation() {
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

  createLedgerMutation() {
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

  updateTenantMutation() {
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
}

class CloudApi {
  private readonly cloud: CloudContext;
  constructor(cloud: CloudContext) {
    this.cloud = cloud;
  }

  private async getAuth() {
    return exception2Result(() => {
      return this.cloud.getToken()?.then((token) => {
        if (!token) throw new Error("No token available");
        return token as AuthType;
      });
    });
  }

  private async request<T extends TypeString, S>(req: WithType<T>): Promise<Result<S>> {
    const rAuth = await this.getAuth();
    if (rAuth.isErr()) {
      return Result.Err(rAuth.Err());
    }
    const reqBody = JSON.stringify({
      ...req,
      auth: rAuth.Ok(),
    });
    // console.log(API_URL, reqBody);
    const res = await fetch(API_URL, {
      method: "POST",
      // headers: {
      // "Content-Type": "application/json",
      // "Accept": "application/json",
      // },
      body: reqBody,
    });
    if (res.ok) {
      const jso = await res.json();
      // console.log("jso", jso);
      return Result.Ok(jso);
    }
    const body = await res.text();
    return Result.Err(`HTTP: ${res.status} ${res.statusText}: ${body}`);
  }

  ensureUser(req: WithoutTypeAndAuth<ReqEnsureUser>): Promise<Result<ResEnsureUser>> {
    return this.request<ReqEnsureUser, ResEnsureUser>({ ...req, type: "reqEnsureUser" });
  }
  findUser(req: WithoutTypeAndAuth<ReqFindUser>): Promise<Result<ResFindUser>> {
    return this.request<ReqFindUser, ResFindUser>({ ...req, type: "reqFindUser" });
  }
  createTenant(req: WithoutTypeAndAuth<ReqCreateTenant>): Promise<Result<ResCreateTenant>> {
    return this.request<ReqCreateTenant, ResCreateTenant>({ ...req, type: "reqCreateTenant" });
  }
  updateTenant(req: WithoutTypeAndAuth<ReqUpdateTenant>): Promise<Result<ResUpdateTenant>> {
    return this.request<ReqUpdateTenant, ResUpdateTenant>({ ...req, type: "reqUpdateTenant" });
  }
  deleteTenant(req: WithoutTypeAndAuth<ReqDeleteTenant>): Promise<Result<ResDeleteTenant>> {
    return this.request<ReqDeleteTenant, ResDeleteTenant>({ ...req, type: "reqDeleteTenant" });
  }
  connectUserToTenant(req: WithoutTypeAndAuth<ReqRedeemInvite>): Promise<Result<ResRedeemInvite>> {
    return this.request<ReqRedeemInvite, ResRedeemInvite>({ ...req, type: "reqRedeemInvite" });
  }
  listTenantsByUser(req: WithoutTypeAndAuth<ReqListTenantsByUser>): Promise<Result<ResListTenantsByUser>> {
    return this.request<ReqListTenantsByUser, ResListTenantsByUser>({ ...req, type: "reqListTenantsByUser" });
  }
  inviteUser(req: WithoutTypeAndAuth<ReqInviteUser>): Promise<Result<ResInviteUser>> {
    return this.request<ReqInviteUser, ResInviteUser>({ ...req, type: "reqInviteUser" });
  }
  listInvites(req: WithoutTypeAndAuth<ReqListInvites>): Promise<Result<ResListInvites>> {
    return this.request<ReqListInvites, ResListInvites>({ ...req, type: "reqListInvites" });
  }
  deleteInvite(req: WithoutTypeAndAuth<ReqDeleteInvite>): Promise<Result<ResDeleteInvite>> {
    return this.request<ReqDeleteInvite, ResDeleteInvite>({ ...req, type: "reqDeleteInvite" });
  }
  updateUserTenant(req: WithoutTypeAndAuth<ReqUpdateUserTenant>): Promise<Result<ResUpdateUserTenant>> {
    return this.request<ReqUpdateUserTenant, ResUpdateUserTenant>({ ...req, type: "reqUpdateUserTenant" });
  }
  createLedger(req: WithoutTypeAndAuth<ReqCreateLedger>): Promise<Result<ResCreateLedger>> {
    return this.request<ReqCreateLedger, ResCreateLedger>({ ...req, type: "reqCreateLedger" });
  }
  updateLedger(req: WithoutTypeAndAuth<ReqUpdateLedger>): Promise<Result<ResUpdateLedger>> {
    return this.request<ReqUpdateLedger, ResUpdateLedger>({ ...req, type: "reqUpdateLedger" });
  }
  deleteLedger(req: WithoutTypeAndAuth<ReqDeleteLedger>): Promise<Result<ResDeleteLedger>> {
    return this.request<ReqDeleteLedger, ResDeleteLedger>({ ...req, type: "reqDeleteLedger" });
  }
  listLedgersByUser(req: WithoutTypeAndAuth<ReqListLedgersByUser>): Promise<Result<ResListLedgersByUser>> {
    return this.request<ReqListLedgersByUser, ResListLedgersByUser>({ ...req, type: "reqListLedgersByUser" });
  }
  getCloudSessionToken(req: WithoutTypeAndAuth<ReqCloudSessionToken>): Promise<Result<ResCloudSessionToken>> {
    return this.request<ReqCloudSessionToken, ResCloudSessionToken>({ ...req, type: "reqCloudSessionToken" });
  }
}
