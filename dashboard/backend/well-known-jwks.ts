import { Lazy } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { getCloudPubkeyFromEnv } from "@fireproof/core-protocols-dashboard";

const getKey = Lazy(async (opts: Record<string, string>) => {
  const sthis = ensureSuperThis();
  const cstPub = opts.CLOUD_SESSION_TOKEN_PUBLIC ?? sthis.env.get("CLOUD_SESSION_TOKEN_PUBLIC");

  const result = await getCloudPubkeyFromEnv(cstPub, sthis);

  if (result.isErr()) {
    return {
      status: 500,
      value: { error: result.Err().toString() },
    };
  }

  return {
    status: 200,
    value: result.Ok(),
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
