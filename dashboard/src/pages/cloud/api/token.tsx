import { BuildURI, to_uint8, URI } from "@adviser/cement";
import { AppContext } from "../../../app-context.tsx";
import { Navigate, replace, useNavigate } from "react-router-dom";
import {  useContext, useEffect, useState } from "react";
import { base58btc } from "multiformats/bases/base58";

export function redirectBackUrl() {
  const uri = URI.from(window.location.href);
  if (uri.hasParam("token")) {
    const backUrl = uri.getParam("back_url", "");
    console.log("api-RedirectBackUrl", backUrl, window.location.href);
    window.location.href = backUrl;
  }
}

export function ApiToken() {
  const { cloud } = useContext(AppContext);
  const cloudToken = cloud.getCloudToken();
  // const [redirectTo, setRedirectTo] = useState<string>("");

  const navigate = useNavigate();

  const buri = URI.from(window.location.href);
  if (cloud._clerkSession?.isSignedIn === false) {
    const tos = buri
      .build()
      .pathname("/login")
      .cleanParams()
      .setParam("redirect_url", buri.withoutHostAndSchema)
      .URI().withoutHostAndSchema;
    console.log("tos", tos);
    return <Navigate to={tos} />;
    // return <div>Not logged in:{tos}</div>;
  }
  useEffect(() => {
    if (cloud._clerkSession?.isSignedIn === true && !buri.hasParam("token") ) {
      if (cloudToken.data) {
        const back_url = BuildURI.from(buri.getParam("back_url")).setParam("fpToken", cloudToken.data.token).URI();
        const redirectTo = buri.build().setParam("token", "ready").setParam("back_url", back_url.toString()).URI().withoutHostAndSchema;
        console.log("set-redirectTo", back_url, redirectTo);
        // window.location.assign(back_url);
        // window.location.replace(redirectTo); 
        // setRedirectTo(back_url.toString());
        navigate(redirectTo.toString(), { replace: true });
      }
    }
  }, [cloudToken.data, cloud._clerkSession?.isSignedIn]);

  console.log("is to nav", buri.hasParam("token"));
  if (buri.hasParam("token")) {
    const url = BuildURI.from(window.location.href).pathname("/fp/cloud/api/token").cleanParams("token").URI().withoutHostAndSchema;
    console.log("nav-redirectUrl", url)
     return <Navigate to={url} />;
  }

  return (
    <>
      <div>Waiting for Fireproof Backend token for: {buri.getParam("back_url")} - {window.location.href}</div>
    </>
  );
}
