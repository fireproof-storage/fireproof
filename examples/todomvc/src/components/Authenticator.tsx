import React from "react";
import { Authenticator as AuthCore, useAuthenticator } from "@w3ui/react-keyring";

export function AuthenticationForm(): JSX.Element {
  const [{ submitted }] = useAuthenticator();

  return (
    <div className="authenticator">
      <AuthCore.Form className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md px-10 pt-14 pb-8">
        <div>
          <label
            className="block mb-2 uppercase text-white/80 text-xs font-semibold tracking-wider m-1 font-mono"
            htmlFor="authenticator-email"
          >
            Email
          </label>
          <AuthCore.EmailInput className="block rounded-md p-2 w-80 bg-white shadow-md" id="authenticator-email" required />
        </div>
        <button
          className="mt-2 bg-white/0 w-full hover:bg-blue-800 rounded-md w-full text-sm font-medium text-white py-2 px-8 transition-colors ease-in"
          type="submit"
          disabled={submitted}
        >
          Register
        </button>
      </AuthCore.Form>
    </div>
  );
}

export function AuthenticationSubmitted(): JSX.Element {
  const [{ email }] = useAuthenticator();

  return (
    <div className="authenticator">
      <div className="bg-gray-400 px-24 py-16 rounded-md">
        <h1 className="text-xl">Verify your email address!</h1>
        <p className="pt-2 pb-4">Click the link in the email we sent to {email} to sign in.</p>
        <AuthCore.CancelButton className="w3ui-button w-full">Cancel</AuthCore.CancelButton>
      </div>
    </div>
  );
}

export function AuthenticationEnsurer({ children }: { children: JSX.Element | JSX.Element[] }): JSX.Element {
  const [{ spaces, submitted }] = useAuthenticator();
  const registered = Boolean(spaces.some((s) => s.registered()));
  if (registered) {
    return <>{children}</>;
  }
  if (submitted) {
    return <AuthenticationSubmitted />;
  }
  return <AuthenticationForm />;
}

interface AuthenticatorProps {
  children: JSX.Element | JSX.Element[];
  className?: string;
}

export function Authenticator({ children, className = "" }: AuthenticatorProps): JSX.Element {
  return (
    <AuthCore as="div" className={className}>
      <AuthenticationEnsurer>{children}</AuthenticationEnsurer>
    </AuthCore>
  );
}

/**
 * Wrapping a component with this HoC ensures an identity exists.
 */
export function withIdentity<C extends React.JSXElementConstructor<P>, P>(Component: C) {
  return (props: any) => (
    <Authenticator>
      <Component {...props} />
    </Authenticator>
  );
}
