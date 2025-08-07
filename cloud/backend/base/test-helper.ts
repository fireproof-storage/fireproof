import { BuildURI, CoerceURI, Result, URI } from "@adviser/cement";
import { SuperThis } from "@fireproof/core-types-base";
import { sts } from "@fireproof/core-runtime";
import type { GenerateKeyPairOptions } from "jose/key/generate/keypair";
import * as ps from "@fireproof/core-types-protocols-cloud";
import * as psc from "@fireproof/core-protocols-cloud";
import { TokenForParam } from "@fireproof/core-types-protocols-cloud";

type MsgerParamsWithEnDe = psc.MsgerParamsWithEnDe;
type MsgRawConnection<T extends MsgBase> = ps.MsgRawConnection<T>;
type MsgBase = ps.MsgBase;
type Gestalt = ps.Gestalt;
// type MsgerParams = ps.cloud.MsgerParams;

const msger = new psc.MsgOpenWSAndHttp();

const { defaultMsgParams, WSConnection, HttpConnection, authTypeFromUri } = psc;
const {
  defaultGestalt,

  buildReqGestalt,
  MsgIsResGestalt,
  MsgIsError,
} = ps;

export function httpStyle(
  sthis: SuperThis,
  applyAuthToURI: (uri: CoerceURI) => URI,
  endpoint: string,
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
        BuildURI.from(endpoint)
          // .pathname(path)
          .setParam("capabilities", remote.protocolCapabilities.join(","))
          .URI(),
      open: () => {
        const handw = new psc.MsgOpenWSAndHttp();
        return handw.openHttp(
          sthis,
          [applyAuthToURI(BuildURI.from(endpoint).setParam("capabilities", remote.protocolCapabilities.join(",")).URI())],
          {
            ...msgP,
            // protocol: "http",
            timeout: 1000,
          },
          exGt,
        );
      },
    },
    connRefused: {
      url: () => URI.from(`http://127.0.0.1:1023/`),
      open: async (): Promise<Result<MsgRawConnection<MsgBase>>> => {
        const ret = await msger.openHttp(
          sthis,
          [URI.from(`http://localhost:1023/`)],
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

        const rAuth = await authTypeFromUri(sthis.logger, applyAuthToURI(`http://localhost:1023/`));
        // should fail
        const res = await ret.Ok().request(buildReqGestalt(sthis, rAuth.Ok(), my), { waitFor: MsgIsResGestalt, noConn: true });
        if (MsgIsError(res)) {
          return Result.Err(res.message);
        }
        return ret;
      },
    },
    timeout: {
      url: () => URI.from(`http://4.7.1.1/`),
      open: async (): Promise<Result<MsgRawConnection<MsgBase>>> => {
        const ret = await msger.openHttp(
          sthis,
          [URI.from(`http://4.7.1.1/`)],
          {
            ...msgP,
            // protocol: "http",
            timeout: 500,
          },
          exGt,
        );
        // should fail
        const rAuth = await authTypeFromUri(sthis.logger, applyAuthToURI(`http://4.7.1.1/`));
        const res = await ret.Ok().request(buildReqGestalt(sthis, rAuth.Ok(), my), { waitFor: MsgIsResGestalt, noConn: true });
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
  endpoint: string,
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
        BuildURI.from(endpoint)
          // .pathname(path)
          .setParam("capabilities", remote.protocolCapabilities.join(","))
          .URI(),
      open: () => {
        const handw = new psc.MsgOpenWSAndHttp();
        return handw.openWS(
          sthis,
          applyAuthToURI(BuildURI.from(endpoint).setParam("capabilities", remote.protocolCapabilities.join(",")).URI()),
          {
            ...msgP,
            // protocol: "http",
            timeout: 1000,
          },
          exGt,
        );
      },
    },
    connRefused: {
      url: () => URI.from(`http://127.0.0.1:1023/`),
      open: () =>
        msger.openWS(
          sthis,
          applyAuthToURI(URI.from(`http://localhost:1023/`)),
          {
            ...msgP,
            // protocol: "ws",
            timeout: 1000,
          },
          exGt,
        ),
    },
    timeout: {
      url: () => URI.from(`http://4.7.1.1/`),
      open: () =>
        msger.openWS(
          sthis,
          applyAuthToURI(URI.from(`http://4.7.1.1/`)),
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

// export function NodeHonoServerFactory(sthis: SuperThis) {
//   return {
//     name: "NodeHonoServer",
//     port: cloudBackendParams(sthis).port,
//     // eslint-disable-next-line @typescript-eslint/no-unused-vars
//     factory: async (sthis: SuperThis, msgP: MsgerParams, remoteGestalt: Gestalt, _port: number, pubEnvJWK: string) => {
//       // const { env } = await resolveToml();
//       // sthis.env.set(envKeyDefaults.PUBLIC, pubEnvJWK);
//       // sthis.env.sets(env as unknown as Record<string, string>);
//       const nhf = new NodeHonoFactory(sthis, {
//         msgP,
//         gs: remoteGestalt,
//         sql: drizzle(createClient({ url: `file://./dist/node-meta.sqlite` })),
//         // new BetterSQLDatabase("./dist/node-meta.sqlite"),
//       });
//       return new HonoServer(nhf);
//     },
//   };
// }

export function portRandom(sthis: SuperThis): number {
  const envPort = sthis.env.get("FP_WRANGLER_PORT");
  return envPort ? +envPort : 1024 + Math.floor(Math.random() * (65536 - 1024));
}

export interface MockJWK {
  keys: sts.KeysResult;
  authType: ps.FPJWKCloudAuthType;
  applyAuthToURI: (uri: CoerceURI) => URI;
  claims: ps.TokenForParam;
}

export async function mockJWK(sthis: SuperThis, claim: Partial<TokenForParam> = {}): Promise<MockJWK> {
  const publicJWKStr =
    sthis.env.get(sts.envKeyDefaults.PUBLIC) ??
    "zeWndr5LEoaySgKSo2aZniYqaZvsKKu1RhfpL2R3hjarNgfXfN7CvR1cAiT74TMB9MQtMvh4acC759Xf8rTwCgxXvGHCBjHngThNtYpK2CoysiAMRJFUi9irMY9H7WApJkfxB15n8ss8iaEojcGB7voQVyk2T6aFPRnNdkoB6v5zk";
  // that could be solved better now with globalSetup.v2-cloud.ts
  const publicJWK = await sts.env2jwk(publicJWKStr, "ES256", sthis);
  const privateJWKStr =
    sthis.env.get(sts.envKeyDefaults.SECRET) ??
    "z33KxHvFS3jLz72v9DeyGBqo79qkbpv5KNP43VKUKSh1fcLb629pFTFyiJEosZ9jCrr8r9TE44KXCPZ2z1FeWGsV1N5gKjGWmZvubUwNHPynxNjCYy4GeYoQ8ukBiKjcPG22pniWCnRMwZvueUBkVk6NdtNY1uwyPk2HAGTsfrw5CBJvTcYsaFeG11SKZ9Q55Xk1W2p4gtZQHzkYHdfQQhgZ73Ttq7zmFoms73kh7MsudYzErx";
  const privateJWK = await sts.env2jwk(privateJWKStr, "ES256", sthis);
  // console.log(">>>>>", publicJWKStr, privateJWKStr);

  sthis.env.set(sts.envKeyDefaults.PUBLIC, publicJWKStr);
  sthis.env.set(sts.envKeyDefaults.SECRET, privateJWKStr);

  const keys = await sts.SessionTokenService.generateKeyPair(
    "ES256",
    {
      extractable: true,
    },

    (_alg: string, _options: GenerateKeyPairOptions) => {
      return Promise.resolve({
        privateKey: privateJWK,
        publicKey: publicJWK,
      });
    },
  );

  const stsService = await sts.SessionTokenService.create({
    token: keys.strings.privateKey,
  });

  const id = claim.jti ?? sthis.nextId().str;
  const claims: ps.TokenForParam = {
    userId: `hello-${id}`,
    email: `hello-${id}@test.de`,
    created: claim.created ?? new Date(),
    tenants: claim.tenants ?? [{ id: `test-tenant-${id}`, role: "admin" }],
    ledgers: claim.ledgers ?? [{ id: `test-ledger-${id}`, role: "admin", right: "write" }],
    selected: claim.selected ?? {
      tenant: claim.tenants?.[0].id ?? `test-tenant-${id}`,
      ledger: claim.ledgers?.[0].id ?? `test-ledger-${id}`,
    },
    ...claim,
  };
  const jwk = await stsService.tokenFor(claims);

  return {
    keys,
    claims,
    authType: {
      type: "fp-cloud-jwk",
      params: {
        jwk,
      },
    },
    applyAuthToURI: (uri: CoerceURI) => BuildURI.from(uri).setParam("authJWK", jwk).URI(),
  };
}
