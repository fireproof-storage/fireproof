import { useSession } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import { ResListTenantsByUser, UserTenant } from "../../backend/api.ts";


export function useListTendantsByUser() {
    const { isLoaded, session, isSignedIn } = useSession()
    const [ listTendants, setListTenants ] = useState({
      type: "resListTenantsByUser",
      userRefId: "unk",
      authUserId: "unk",
      tenants: []
    } as ResListTenantsByUser)
    useEffect(() => {
      if (isSignedIn && isLoaded) {
        session
          .getToken({
            template: "with-email",
            // leewayInSeconds: 60
          })
          .then((token) => {
            console.log(token);
            // setToken(token!)
            fetch('http://localhost:7370/', {
              method: 'POST',
              body: JSON.stringify({
                  type: "tbd",
                  auth: {
                      type: "clerk",
                      token: token
                  }
              }),
            }).catch(console.error).then(async (res) => {
              if (res && res.ok) {
                const jso = await res.json();
                console.log(jso.listTenantsByUser);
                setListTenants(jso.listTenantsByUser);
              }
            })
          });
      }
    }, [session, isLoaded, isSignedIn]);
    return listTendants
  }

  export function tenantName(tenant: UserTenant) {
    return tenant.name || tenant.tenantName || tenant.tenantId
  }
