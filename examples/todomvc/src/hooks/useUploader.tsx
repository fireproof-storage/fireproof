// @ts-nocheck
import { useEffect, useState, createContext } from "react";
import { useKeyring, Authenticator } from "@w3ui/react-keyring";
import { Store } from "@web3-storage/upload-client";
import { InvocationConfig } from "@web3-storage/upload-client/types";
import { store } from "@web3-storage/capabilities/store";
import { Fireproof } from "@fireproof/core";

export const UploaderCtx = createContext<{
  uploaderReady: boolean;
}>({
  uploaderReady: false,
});

async function fetchWithRetries(url: string, retries: number): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

export function useUploader(database: Fireproof) {
  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring();
  const registered = Boolean(space?.registered());
  const [uploaderReady, setUploaderReady] = useState(false);
  const [remoteBlockReaderReady, setRemoteBlockReaderReady] = useState(false);

  useEffect(() => {
    if (!remoteBlockReaderReady) {
      database.setRemoteBlockReader(async (cid: any) => {
        const response = await fetchWithRetries(`https://${cid}.ipfs.w3s.link/`, 2);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      });
      setRemoteBlockReaderReady(true);
    }

    const setUploader = async () => {
      if (uploaderReady) return;
      const delegz = { with: space.did(), ...store };
      delegz.can = "store/*";
      const conf = {
        issuer: agent,
        with: delegz.with,
        proofs: await getProofs([delegz]),
      };
      database.setCarUploader(async (carCid: any, carBytes: Uint8Array) => {
        await uploadCarBytes(conf, carCid, carBytes);
      });
      setUploaderReady(true);
    };

    const doLoadAgent = async () => {
      // console.log('loadAgent', loadAgent, typeof loadAgent)
      const ag = await loadAgent();
      // console.log('loaded agent', ag)
    };

    if (registered) {
      setUploader();
    } else {
      doLoadAgent();
    }
  }, [space]);

  return { uploaderReady };
}

export const UploadManager = ({}: { registered: boolean }) => {
  const [{ agent, space }, { getProofs, loadAgent }] = useKeyring();
  const registered = Boolean(space?.registered());
  // console.log('loadAgent', loadAgent, typeof loadAgent)
  const child = registered ? (
    <p>
      Your changes are being saved to the public IPFS network with <a href="http://web3.storage">web3.storage</a>
    </p>
  ) : (
    <SpaceRegistrar />
  );
  // return <></>
  return (
    <div className="uploadManager">
      <h2>
        Replicate to <a href="https://web3.storage">web3.storage</a>
      </h2>
      <Authenticator>{child}</Authenticator>
    </div>
  );
};
function SpaceRegistrar(): JSX.Element {
  const [, { registerSpace }] = useKeyring();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function resetForm(): void {
    setEmail("");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitted(true);

    try {
      await registerSpace(email);
    } catch (err) {
      console.log(err);
      throw new Error("failed to register", { cause: err });
    } finally {
      resetForm();
      setSubmitted(false);
    }
  }

  return (
    <div className="flex flex-col items-center space-y-24 pt-12">
      <div className="flex flex-col items-center space-y-2">
        <h3 className="text-lg">Verify your email address!</h3>
        <p>web3.storage is sending you a verification email. Please click the link.</p>
      </div>
      <div className="flex flex-col items-center space-y-4">
        <h5>Need a new verification email?</h5>
        <form
          className="flex flex-col items-center space-y-2"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            void onSubmit(e);
          }}
        >
          <input
            className="text-black px-2 py-1 rounded"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
          <input type="submit" className="w3ui-button" value="Re-send Verification Email" disabled={email === ""} />
        </form>
        {submitted && <p>Verification re-sent, please check your email for a verification email.</p>}
      </div>
    </div>
  );
}

export async function uploadCarBytes(conf: InvocationConfig, carCID: any, carBytes: Uint8Array) {
  return await Store.add(conf, new Blob([carBytes]));
}
