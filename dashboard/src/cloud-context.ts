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
} from "../backend/api.ts";
import { AuthType } from "../backend/users.ts";
import { API_URL } from "./helpers.ts";
import { useEffect, useState } from "react";
import { inject } from "vitest";
import { set } from "react-hook-form";

interface TypeString {
  type: string;
}

interface WithType<T extends TypeString> {
  type: T["type"];
}

type WithoutTypeAndAuth<T> = Omit<T, "type" | "auth">;

const emptyListTenantsByUser: ResListTenantsByUser = {
  type: "resListTenantsByUser",
  userId: "unk",
  authUserId: "unk",
  tenants: [] as UserTenant[],
};

export class CloudContext {
  readonly api = new CloudApi();

  // refreshListTenantsByUser = {
  //     refresh: new Date().toISOString(),
  //     _set: function(value: string) {
  //         this.refresh = value;
  //     },
  //     set: function() {
  //         this._set(new Date().toISOString());
  //     }
  // }
  updateContext() {
    this.api.injectSession(useSession());
    const [listTenants, set] = useState(emptyListTenantsByUser);
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

  useListTenantsByUser(id: string = "unk"): { val: ResListTenantsByUser; refresh: () => void } {
    const [sharedValue, setSharedValue] = useState(emptyListTenantsByUser);
    const [sharedRefresh, setSharedRefresh] = useState("initial");

    const updateSharedValue = () => {
      setSharedRefresh(new Date().toISOString());
    };
    console.log("useListTenantsByUser", id, sharedValue);

    useEffect(() => {
      // console.log("useTenants", cloudContext.api.session?.isLoaded, cloudContext.api.session?.isSignedIn);
      console.log("useTenants-effect");
      this.api
        .listTenantsByUser({})
        .then((rRes) => {
          if (rRes.isOk()) {
            console.log("update listTenants", id, rRes.Ok());
            setSharedValue(rRes.Ok());
            // this.refreshListTenantsByUser.set(rRes.Ok());
          }
        })
        .catch(console.error);
    }, [this, this.api.session?.isLoaded, this.api.session?.isSignedIn, sharedRefresh]);
    return { val: sharedValue, refresh: updateSharedValue };
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
  connectUserToTenant(req: WithoutTypeAndAuth<ReqConnectUserToTenant>): Promise<Result<ResConnectUserToTenant>> {
    return this.request<ReqConnectUserToTenant, ResConnectUserToTenant>({ ...req, type: "reqConnectUserToTenant" });
  }
  listTenantsByUser(req: WithoutTypeAndAuth<ReqListTenantsByUser>): Promise<Result<ResListTenantsByUser>> {
    if (this.isActive()) {
      return this.request<ReqListTenantsByUser, ResListTenantsByUser>({ ...req, type: "reqListTenantsByUser" });
    }
    return Promise.resolve(
      Result.Ok({
        type: "resListTenantsByUser",
        userId: "unk",
        authUserId: "unk",
        tenants: [],
      }),
    );
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
