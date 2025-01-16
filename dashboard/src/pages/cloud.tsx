import { createContext, Suspense, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { WithSidebar } from "../layouts/with-sidebar.tsx";
import { AppContext } from "../app-context.tsx";
import { ResListTenantsByUser, UserTenant } from "../../backend/api.ts";
import { truncateDbName } from "../helpers.ts";
import { tenantName, useListTendantsByUser } from "../hooks/tenant.ts";

export async function cloudLoader({ request }: { request: Request }) {
  // const url = new URL(request.url);
  // const nextUrl = url.searchParams.get("next_url") || "/";
  // return nextUrl;
}

export interface CloudContextType {
  getListTenants: () => ResListTenantsByUser;
}
export const CloudContext = createContext({
  getListTenants: (): ResListTenantsByUser => {
    return {
      type: "resListTenantsByUser",
      userRefId: "unk",
      authUserId: "unk",
      tenants: [],
    };
  },
});

export function Cloud() {
  // const nextUrl = useLoaderData() as string;
  // const navigate = useNavigate();

  // const [token, setToken] = useState('');

  // useEffect(() => {
  //   if (isSignedIn && isLoaded) {
  //     session.getToken({
  //       template: "with-email",
  //       // leewayInSeconds: 60
  //     }).then((token) => {
  //       // setToken(token!)
  //       console.log(token)
  //       // fetch('http://localhost:3000/api/verify', {
  //       //   method: 'POST',
  //       //   body: JSON.stringify(token),
  //       // }).catch(console.error).then(console.log)
  //     })
  //   }
  // }, [session, isLoaded, isSignedIn])

  // console.log("token", isSignedIn, isLoaded, session)

  const listTendants = useListTendantsByUser();
  return (
    <CloudContext.Provider value={{ getListTenants: () => listTendants }}>
      <WithSidebar sideBarComponent={<SidebarCloud />} title={"Tenants"} />;
    </CloudContext.Provider>
  );
  // return (

  //     <div className="h-screen w-screen flex items-center justify-center">
  //       <div className="flex flex-col items-center gap-4">
  //         <SignedOut>
  //           <SignInButton />
  //         </SignedOut>
  //         {!isSignedIn &&
  //         <SignIn
  //           appearance={{
  //             elements: {
  //               headerSubtitle: { display: "none" },
  //               footer: { display: "none" },
  //             },
  //           }}
  //         />}
  //       </div>
  //     </div>
  // );
}

function SidebarCloud() {
  const { openMenu, toggleMenu, setIsSidebarOpen } = useContext(AppContext);
  const navigate = useNavigate();

  const { getListTenants } = useContext(CloudContext);

  const navigateToTendant = (tendant: UserTenant) => {
    navigate(`/fp/cloud/${tendant.tenantId}`);
    setIsSidebarOpen(false); // Close sidebar on mobile after navigation
  };
  // const { databases } = useLoaderData<{
  //   databases: { name: string; queries: any[] }[];
  // }>();
  return (
    <Suspense fallback={<div>Loading...</div>}>
      {getListTenants().tenants.map((tenant) => (
        <div key={tenant.tenantId}>
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => navigateToTendant(tenant)}
              className="flex-grow text-left rounded px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
            >
              <span title={tenantName(tenant)}>{truncateDbName(tenantName(tenant), 20)}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMenu(tenantName(tenant));
              }}
              className="flex items-center justify-center w-8 h-8 rounded transition-colors hover:bg-muted"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 transition-transform duration-200 ${openMenu === tenantName(tenant) ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
          <div
            className={`pl-6 mt-2 space-y-2 overflow-hidden transition-all duration-200 ease-in-out ${
              openMenu === tenantName(tenant) ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            {/* {navLinks.map((link) => (
              <NavLink
                end
                key={link.to}
                to={`/fp/databases/${db.name}${link.to}`}
                className={({ isActive }) =>
                  `block rounded px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground ${
                    isActive ? "font-bold" : ""
                  }`
                }
                onClick={() => setIsSidebarOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
            {db.queries.length > 0 && (
              <div className="text-sm text-muted-foreground pl-3">
                Saved Queries:
                {db.queries.map((query, index) => (
                  <NavLink
                    key={index}
                    to={`/fp/databases/${db.name}/query/${query._id}`}
                    className="block rounded px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
                  >
                    {query.name || `Query ${index + 1}`}
                  </NavLink>
                ))}
              </div>
            )} */}
          </div>
        </div>
      ))}
    </Suspense>
  );
}
