import { exception2Result } from "@adviser/cement";
import { useSession } from "@clerk/clerk-react";
import { Result } from "use-fireproof";
import {
  ResEnsureUser,
  ReqEnsureUser,
  ReqFindUser,
  ResFindUser,
  ReqCreateTenant,
  ResCreateTenant,
  ReqUpdateTenant,
  ResUpdateTenant,
  ReqDeleteTenant,
  ResDeleteTenant,
  ReqConnectUserToTenant,
  ResConnectUserToTenant,
  ReqListTenantsByUser,
  ResListTenantsByUser,
  ReqInviteUser,
  ResInviteUser,
  ReqListInvites,
  ResListInvites,
  ReqDeleteInvite,
  ResDeleteInvite,
  UserTenant,
  ReqUpdateUserTenant,
  ResUpdateUserTenant,
  ResListLedgerByTenant,
} from "../backend/api.ts";
import { AuthType } from "../backend/users.ts";
import { API_URL } from "./helpers.ts";
import { use, useContext, useEffect, useMemo, useState } from "react";
import { set } from "react-hook-form";
import { AppContext } from "./app-context.tsx";
import { int } from "drizzle-orm/mysql-core";
import { ac } from "vitest/dist/chunks/reporters.D7Jzd9GS.js";

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

export class InviteStateItem {
  readonly invites: Map<string, ResListInvites>;

  constructor(inv?: InviteStateItem) {
    this.invites = inv ? inv.invites : new Map<string, ResListInvites>();
  }

  add(tenantId: string, list: ResListInvites) {
    this.invites.set(tenantId, list);
    return new InviteStateItem(this);
  }
  get(tenantId: string): ResListInvites {
    let item = this.invites.get(tenantId);
    if (!item) {
      item = emptyListInvites;
      this.add(tenantId, item);
    }
    return item;
  }
}

const emptyEnsureUser: ResEnsureUser = {
  type: "resEnsureUser",
  user: {
    userId: "unk",
    maxTenants: 0,
    status: "inactive",
    createdAt: new Date(),
    updatedAt: new Date(),
    byProviders: [],
  },
  tenants: [],
};

export class CloudContext {
  readonly api = new CloudApi();

  sharedState = {
    listTenantsByUser: {
      val: emptyListTenantsByUser,
      set: (value: ResListTenantsByUser) => {},
    },
    refreshListTenantsByUser: {
      val: new Date().toISOString(),
      set: (value: string) => {},
    },

    listInvitesByTenant: {
      val: new InviteStateItem(),
      set: (value: InviteStateItem): void => {
        throw new Error("Not implemented");
      },
    },
    refreshListInvitesByTenant: {
      val: new Date().toISOString(),
      set: (value: string): void => {
        throw new Error("Not implemented");
      },
    },
    ensureUser: {
      val: emptyEnsureUser,
      set: (value: ResEnsureUser) => {},
    },
  };

  initContext() {
    console.log("initContext");

    const [val, set] = useState(emptyListTenantsByUser);
    this.sharedState.listTenantsByUser.val = val;
    this.sharedState.listTenantsByUser.set = set;
    const [refreshListTenants, setRefreshListTenants] = useState("initial");
    this.sharedState.refreshListTenantsByUser.val = refreshListTenants;
    this.sharedState.refreshListTenantsByUser.set = setRefreshListTenants;

    const [invites, setInvites] = useState(new InviteStateItem());
    this.sharedState.listInvitesByTenant.val = invites;
    this.sharedState.listInvitesByTenant.set = setInvites;
    const [refreshListInvitesByTenant, setRefreshListInvitesByTenant] = useState("initial");
    this.sharedState.refreshListInvitesByTenant.val = refreshListInvitesByTenant;
    this.sharedState.refreshListInvitesByTenant.set = setRefreshListInvitesByTenant;

    const [ensureUser, setEnsureUser] = useState(emptyEnsureUser);
    this.sharedState.ensureUser.val = ensureUser;
    this.sharedState.ensureUser.set = setEnsureUser;
  }

  updateContext() {
    this.api.injectSession(useSession());
    // const [listTenants, set] = useState(emptyListTenantsByUser);

    // this.refreshListTenantsByUser.listTenants = listTenants;
    // this.refreshListTenantsByUser.set = set
    // const [ refresh, setRefresh ] = useState("initial");
    // this.refreshListTenantsByUser.refreshTrigger.val = refresh;
    // this.refreshListTenantsByUser.refreshTrigger.set = setRefresh;
  }

  // refreshListTenantsByUser = {
  //     listTenants: emptyListTenantsByUser,
  //     set: function(value: ResListTenantsByUser)  {
  //         this.listTenants = value;
  //     },
  //     refreshTrigger: {
  //         val: new Date().toISOString(),
  //         set: function(date: string) {
  //             this.val = date
  //         }
  //     },
  //     refresh: function() {
  //         this.refreshTrigger.set(new Date().toISOString());
  //     },
  // }

  useEnsureUser(): ResEnsureUser {
    useMemo(() => {
      this.api.ensureUser({}).then((rRes) => {
        if (rRes.isOk()) {
          console.log("ensureUser", rRes.Ok());
          this.sharedState.ensureUser.set(rRes.Ok());
        }
      });
    }, [this.api.session?.isLoaded, this.api.session?.isSignedIn]);
    return this.sharedState.ensureUser.val;
  }

  useListLedgersByTenant(tenantId: string): { val: ResListInvites; refresh: (tenantId: string) => void } {
    // const { cloud } = useContext(AppContext);
    throw new Error("Not implemented");
  }

  useListInvitesByTenant(tenantId: string): { val: InviteStateItem; refresh: () => void } {
    const { cloud } = useContext(AppContext);
    const activeUser = this.useEnsureUser();
    console.log("useListInvitesByTenant", tenantId);
    useEffect(() => {
      if (activeUser.user.status !== "active") {
        return;
      }
      console.log("useListInvitesByTenant", tenantId);
      this.api
        .listInvites({
          tenantIds: [tenantId],
        })
        .then((rRes) => {
          if (rRes.isOk()) {
            console.log("update listInvitesByTenant", tenantId, rRes.Ok());
            cloud.sharedState.listInvitesByTenant.set(cloud.sharedState.listInvitesByTenant.val.add(tenantId, rRes.Ok()));
          }
        })
        .catch(console.error);
    }, [
      this,
      this.api.session?.isLoaded,
      this.api.session?.isSignedIn,
      cloud.sharedState.refreshListTenantsByUser.val,
      cloud.sharedState.refreshListInvitesByTenant.val,
      activeUser.user.status,
      tenantId,
    ]);
    return {
      val: cloud.sharedState.listInvitesByTenant.val,
      refresh: () => {
        console.log("refreshListInvitesByTenant", tenantId);
        cloud.sharedState.refreshListInvitesByTenant.set(new Date().toISOString());
      },
    };
  }

  useListTenantsByUser(): { val: ResListTenantsByUser; refresh: () => void } {
    // const [sharedRefresh, setSharedRefresh] = useState("initial");
    const { cloud } = useContext(AppContext);
    const activeUser = this.useEnsureUser();
    // console.log("useListTenantsByUser", activeUser.user.status);
    useEffect(() => {
      if (activeUser.user.status !== "active") {
        return;
      }
      // console.log("useTenants", cloudContext.api.session?.isLoaded, cloudContext.api.session?.isSignedIn);
      // console.log("useTenants-effect");
      this.api
        .listTenantsByUser({})
        .then((rRes) => {
          if (rRes.isOk()) {
            // console.log("update listTenants", id, rRes.Ok());
            // const my = sharedValue as (Omit<ResListTenantsByUser, "userId"|"authUserId"> & { userId: string, authUserId: string });
            // my.userId = rRes.Ok().userId;
            // my.authUserId = rRes.Ok().authUserId;
            // sharedValue.tenants.splice(0, sharedValue.tenants.length, ...rRes.Ok().tenants);
            cloud.sharedState.listTenantsByUser.set(rRes.Ok());
            // this.refreshListTenantsByUser.set(rRes.Ok());
          }
        })
        .catch(console.error);
    }, [
      this,
      this.api.session?.isLoaded,
      this.api.session?.isSignedIn,
      cloud.sharedState.refreshListTenantsByUser.val,
      activeUser.user.status,
    ]);
    return {
      val: cloud.sharedState.listTenantsByUser.val,
      refresh: () => cloud.sharedState.refreshListTenantsByUser.set(new Date().toISOString()),
    };
  }
}

// export function useListTenants() {
//     const { cloudContext } = useContext(AppContext);
//     const [listTenants, setListTenants] = useState({
//         type: "resListTenantsByUser",
//         userId: "unk",
//         authUserId: "unk",
//         tenants: [] as UserTenant[]
//     } satisfies ResListTenantsByUser);
//     useEffect(() => {
//         // console.log("useTenants", cloudContext.api.session?.isLoaded, cloudContext.api.session?.isSignedIn);
//         cloudContext.api.listTenantsByUser({})
//             .then((rRes) => {
//                 if (rRes.isOk()) {
//                     setListTenants(rRes.Ok());
//                 }
//             })
//             .catch(console.error);
//     }, [cloudContext, cloudContext.api.session?.isLoaded, cloudContext.api.session?.isSignedIn]);
//     return { listTenants };
// }

class CloudApi {
  private async getAuth() {
    return exception2Result(() => {
      return this.session!.session!.getToken({ template: "with-email" }).then((token) => {
        return {
          type: "clerk",
          token: token!,
        } as AuthType;
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
    return Result.Err(`HTTP: ${res.status} ${res.statusText}`);
  }

  async ensureUser(req: WithoutTypeAndAuth<ReqEnsureUser>): Promise<Result<ResEnsureUser>> {
    if (this.isActive()) {
      return this.request<ReqEnsureUser, ResEnsureUser>({ ...req, type: "reqEnsureUser" });
    }
    return Result.Ok(emptyEnsureUser);
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
  connectUserToTenant(req: WithoutTypeAndAuth<ReqConnectUserToTenant>): Promise<Result<ResConnectUserToTenant>> {
    return this.request<ReqConnectUserToTenant, ResConnectUserToTenant>({ ...req, type: "reqConnectUserToTenant" });
  }
  listTenantsByUser(req: WithoutTypeAndAuth<ReqListTenantsByUser>): Promise<Result<ResListTenantsByUser>> {
    if (this.isActive()) {
      return this.request<ReqListTenantsByUser, ResListTenantsByUser>({ ...req, type: "reqListTenantsByUser" });
    }
    return Promise.resolve(Result.Ok(emptyListTenantsByUser));
  }
  inviteUser(req: WithoutTypeAndAuth<ReqInviteUser>): Promise<Result<ResInviteUser>> {
    return this.request<ReqInviteUser, ResInviteUser>({ ...req, type: "reqInviteUser" });
  }
  listInvites(req: WithoutTypeAndAuth<ReqListInvites>): Promise<Result<ResListInvites>> {
    if (this.isActive()) {
      return this.request<ReqListInvites, ResListInvites>({ ...req, type: "reqListInvites" });
    }
    return Promise.resolve(Result.Ok(emptyListInvites));
  }
  deleteInvite(req: WithoutTypeAndAuth<ReqDeleteInvite>): Promise<Result<ResDeleteInvite>> {
    return this.request<ReqDeleteInvite, ResDeleteInvite>({ ...req, type: "reqDeleteInvite" });
  }
  updateUserTenant(req: WithoutTypeAndAuth<ReqUpdateUserTenant>): Promise<Result<ResUpdateUserTenant>> {
    return this.request<ReqUpdateUserTenant, ResUpdateUserTenant>({ ...req, type: "reqUpdateUserTenant" });
  }
  isActive(): boolean {
    return !!(this.session?.isSignedIn && this.session?.isLoaded);
  }
  session?: ReturnType<typeof useSession>;
  injectSession(session: ReturnType<typeof useSession>) {
    // console.log("injectSession", session);
    this.session = session ?? undefined;
    return this;
  }
}
