import { BuildURI, CoerceURI, Result, URI } from "@adviser/cement";
import { SuperThis, rt, ps, ensureSuperThis } from "@fireproof/core";
import type { GenerateKeyPairOptions } from "jose/key/generate/keypair";
import { HonoServer } from "./hono-server.js";
import { NodeHonoFactory } from "./node-hono-server.js";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

type MsgerParamsWithEnDe = ps.cloud.MsgerParamsWithEnDe;
type MsgRawConnection<T extends MsgBase> = ps.cloud.MsgRawConnection<T>;
type MsgBase = ps.cloud.MsgBase;
type Gestalt = ps.cloud.Gestalt;
type MsgerParams = ps.cloud.MsgerParams;

const {
  defaultGestalt,
  defaultMsgParams,
  WSConnection,
  HttpConnection,
  Msger,
  authTypeFromUri,
  buildReqGestalt,
  MsgIsResGestalt,
  applyStart,
  MsgIsError,
} = ps.cloud;

export function httpStyle(
  sthis: SuperThis,
  applyAuthToURI: (uri: CoerceURI) => URI,
  port: number,
  msgP: MsgerParamsWithEnDe,
  my: Gestalt,
) {
  const remote = defaultGestalt(defaultMsgParams(sthis, { hasPersistent: true, protocolCapabilities: ["reqRes"] }), {
    id: "HTTP-server",
  });
  const exGt = { my, remote };
  return {
    name: "HTTP",
    remoteGestalt: remote,
    cInstance: HttpConnection,
    ok: {
      url: () =>
        BuildURI.from(`http://127.0.0.1:${port}`)
          // .pathname(path)
          .setParam("capabilities", remote.protocolCapabilities.join(","))
          .URI(),
      open: () =>
        applyStart(
          Msger.openHttp(
            sthis,
            [BuildURI.from(`http://127.0.0.1:${port}/fp`).setParam("capabilities", remote.protocolCapabilities.join(",")).URI()],
            {
              ...msgP,
              // protocol: "http",
              timeout: 1000,
            },
            exGt,
          ),
        ),
    },
    connRefused: {
      url: () => URI.from(`http://127.0.0.1:${port - 1}/`),
      open: async (): Promise<Result<MsgRawConnection<MsgBase>>> => {
        const ret = await Msger.openHttp(
          sthis,
          [URI.from(`http://localhost:${port - 1}/`)],
          {
            ...msgP,
            // protocol: "http",
            timeout: 1000,
          },
          exGt,
        );
        if (ret.isErr()) {
          return ret;
        }

        const rAuth = await authTypeFromUri(sthis.logger, applyAuthToURI(`http://localhost:${port - 1}/`));
        // should fail
        const res = await ret.Ok().request(buildReqGestalt(sthis, rAuth.Ok(), my), { waitFor: MsgIsResGestalt });
        if (MsgIsError(res)) {
          return Result.Err(res.message);
        }
        return ret;
      },
    },
    timeout: {
      url: () => URI.from(`http://4.7.1.1:${port}/`),
      open: async (): Promise<Result<MsgRawConnection<MsgBase>>> => {
        const ret = await Msger.openHttp(
          sthis,
          [URI.from(`http://4.7.1.1:${port}/`)],
          {
            ...msgP,
            // protocol: "http",
            timeout: 500,
          },
          exGt,
        );
        // should fail
        const rAuth = await authTypeFromUri(sthis.logger, applyAuthToURI(`http://4.7.1.1:${port}/`));
        const res = await ret.Ok().request(buildReqGestalt(sthis, rAuth.Ok(), my), { waitFor: MsgIsResGestalt });
        if (MsgIsError(res)) {
          return Result.Err(res.message);
        }
        return ret;
      },
    },
  };
}

export function wsStyle(
  sthis: SuperThis,
  applyAuthToURI: (uri: CoerceURI) => URI,
  port: number,
  msgP: MsgerParamsWithEnDe,
  my: Gestalt,
) {
  const remote = defaultGestalt(defaultMsgParams(sthis, { hasPersistent: true, protocolCapabilities: ["stream"] }), {
    id: "WS-server",
  });
  const exGt = { my, remote };
  return {
    name: "WS",
    remoteGestalt: remote,
    cInstance: WSConnection,
    ok: {
      url: () =>
        BuildURI.from(`http://127.0.0.1:${port}`)
          // .pathname(path)
          .setParam("capabilities", remote.protocolCapabilities.join(","))
          .URI(),
      open: () =>
        applyStart(
          Msger.openWS(
            sthis,
            applyAuthToURI(
              BuildURI.from(`http://127.0.0.1:${port}/ws`).setParam("capabilities", remote.protocolCapabilities.join(",")).URI(),
            ),
            {
              ...msgP,
              // protocol: "ws",
              timeout: 1000,
            },
            exGt,
          ),
        ),
    },
    connRefused: {
      url: () => URI.from(`http://127.0.0.1:${port - 1}/`),
      open: () =>
        Msger.openWS(
          sthis,
          applyAuthToURI(URI.from(`http://localhost:${port - 1}/`)),
          {
            ...msgP,
            // protocol: "ws",
            timeout: 1000,
          },
          exGt,
        ),
    },
    timeout: {
      url: () => URI.from(`http://4.7.1.1:${port - 1}/`),
      open: () =>
        Msger.openWS(
          sthis,
          applyAuthToURI(URI.from(`http://4.7.1.1:${port - 1}/`)),
          {
            ...msgP,
            // protocol: "ws",
            timeout: 500,
          },
          exGt,
        ),
    },
  };
}

export function NodeHonoServerFactory(sthis: SuperThis) {
  return {
    name: "NodeHonoServer",
    port: cloudBackendParams(sthis).port,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    factory: async (sthis: SuperThis, msgP: MsgerParams, remoteGestalt: Gestalt, _port: number, pubEnvJWK: string) => {
      // const { env } = await resolveToml();
      // sthis.env.set(envKeyDefaults.PUBLIC, pubEnvJWK);
      // sthis.env.sets(env as unknown as Record<string, string>);
      const nhf = new NodeHonoFactory(sthis, {
        msgP,
        gs: remoteGestalt,
        sql: drizzle(createClient({ url: `file://./dist/node-meta.sqlite` })),
        // new BetterSQLDatabase("./dist/node-meta.sqlite"),
      });
      return new HonoServer(nhf);
    },
  };
}

export function portRandom(): number {
  return process.env.FP_WRANGLER_PORT ? +process.env.FP_WRANGLER_PORT : 1024 + Math.floor(Math.random() * (65536 - 1024));
}

export interface BackendParams {
  readonly port: number;
  readonly pid: number;
  readonly envName: string;
}

export function cloudBackendParams(sthis: SuperThis): BackendParams {
  const cf_backend = sthis.env.get("FP_TEST_CLOUD_BACKEND");
  if (!cf_backend) {
    return {
      port: 0,
      pid: 0,
      envName: "not-set",
    };
  }
  return JSON.parse(cf_backend) as BackendParams;
}

export interface MockJWK {
  keys: rt.sts.KeysResult;
  authType: ps.cloud.FPJWKCloudAuthType;
  applyAuthToURI: (uri: CoerceURI) => URI;
}

export async function mockJWK(claim: Partial<ps.cloud.TokenForParam> = {}, sthis = ensureSuperThis()): Promise<MockJWK> {
  // that could be solved better now with globalSetup.v2-cloud.ts
  const publicJWK = await rt.sts.env2jwk(
    "zeWndr5LEoaySgKSo2aZniYqaZvsKKu1RhfpL2R3hjarNgfXfN7CvR1cAiT74TMB9MQtMvh4acC759Xf8rTwCgxXvGHCBjHngThNtYpK2CoysiAMRJFUi9irMY9H7WApJkfxB15n8ss8iaEojcGB7voQVyk2T6aFPRnNdkoB6v5zk",
    "ES256",
    sthis,
  );
  const privateJWK = await rt.sts.env2jwk(
    "z33KxHvFS3jLz72v9DeyGBqo79qkbpv5KNP43VKUKSh1fcLb629pFTFyiJEosZ9jCrr8r9TE44KXCPZ2z1FeWGsV1N5gKjGWmZvubUwNHPynxNjCYy4GeYoQ8ukBiKjcPG22pniWCnRMwZvueUBkVk6NdtNY1uwyPk2HAGTsfrw5CBJvTcYsaFeG11SKZ9Q55Xk1W2p4gtZQHzkYHdfQQhgZ73Ttq7zmFoms73kh7MsudYzErx",
    "ES256",
    sthis,
  );

  const keys = await rt.sts.SessionTokenService.generateKeyPair(
    "ES256",
    {
      extractable: true,
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_alg: string, _options: GenerateKeyPairOptions) => {
      return Promise.resolve({
        privateKey: privateJWK,
        publicKey: publicJWK,
      });
    },
  );

  const sts = await rt.sts.SessionTokenService.create({
    token: keys.strings.privateKey,
  });
  const jwk = await sts.tokenFor({
    userId: "hello",
    tenants: [],
    ledgers: [],
    ...claim,
  });

  return {
    keys,
    authType: {
      type: "fp-cloud-jwk",
      params: {
        jwk,
      },
    },
    applyAuthToURI: (uri: CoerceURI) => BuildURI.from(uri).setParam("authJWK", jwk).URI(),
  };
}

export async function setupBackend(
  sthis: SuperThis,
  // backend: "D1" | "DO",
  // key: string,
  port = portRandom(),
): Promise<{ port: number; pid: number; envName: string; hs: HonoServer }> {
  const envName = `test`;
  if (process.env.FP_WRANGLER_PORT) {
    return Promise.resolve({ port: +process.env.FP_WRANGLER_PORT, pid: 0, envName, hs: {} as HonoServer });
  }

  const nhf = new NodeHonoFactory(sthis, {
    // msgP,
    // gs: remoteGestalt,
    sql: drizzle(createClient({ url: `file://./dist/node-meta.sqlite` })),
    //new BetterSQLDatabase("./dist/node-meta.sqlite"),
  });
  const app = new Hono();
  const hs = new HonoServer(nhf);
  await hs.start().then((srv) => srv.once(app, port));
  //   $.verbose = !!process.env.FP_DEBUG;
  //   const auth = await mockJWK({}, sthis);
  //   await writeEnvFile(sthis, tomlFile, envName, auth.keys.strings.publicKey);
  //   // .dev.vars.<environment-name>
  //   const runningWrangler = $`
  //               wrangler dev -c ${tomlFile} --port ${port} --env ${envName} --no-show-interactive-dev-session --no-live-reload &
  //               waitPid=$!
  //               echo "PID:$waitPid"
  //               wait $waitPid`;
  //   const waitReady = new Future();
  //   let pid: number | undefined;
  //   runningWrangler.stdout.on("data", (chunk) => {
  //     // console.log(">>", chunk.toString())
  //     const mightPid = chunk.toString().match(/PID:(\d+)/)?.[1];
  //     if (mightPid) {
  //       pid = +mightPid;
  //     }
  //     if (chunk.includes("Starting local serv")) {
  //       waitReady.resolve(true);
  //     }
  //   });
  //   runningWrangler.stderr.on("data", (chunk) => {
  //     // eslint-disable-next-line no-console
  //     console.error("!!", chunk.toString());
  //   });
  //   await waitReady.asPromise();
  return { port, pid: 0, envName, hs };
}
