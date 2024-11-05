import { createClient } from "@workos-inc/authkit-js";

let user;
let nextUrl;

export const authProvider = await createClient(
  import.meta.env.VITE_WORKOS_CLIENTID,
  {
    devMode: false,
    onRedirectCallback: (params) => {
      if (params.state) {
        nextUrl = params.state.next_url;
      }
    },
  }
);

user = authProvider.getUser();

export const authResult = { nextUrl, user };
