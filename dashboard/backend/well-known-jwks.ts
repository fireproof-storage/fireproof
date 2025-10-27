import { Lazy } from "@adviser/cement";
import { getCloudPubkeyFromEnv } from "./get-cloud-pubkey-from-env.js";

const getKey = Lazy(async (opts: Record<string, string>) => {
  const rJwtPublicKey = await getCloudPubkeyFromEnv(opts.CLOUD_SESSION_TOKEN_PUBLIC);
  if (rJwtPublicKey.isErr()) {
    return {
      status: 500,
      value: { keys: [] },
    };
  }
  return {
    status: 200,
    value: { keys: [rJwtPublicKey.Ok()] },
  };
});

export async function resWellKnownJwks(_req: Request, opts: Record<string, string>): Promise<Response> {
  const r = await getKey(opts);
  return Promise.resolve(
    new Response(JSON.stringify(r.value), {
      status: r.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=300", // 5 minutes
      },
    }),
  );
}
