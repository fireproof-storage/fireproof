import { Result, URI } from "@adviser/cement";
import { AwsClient } from "aws4fetch";
import { ps } from "@fireproof/core";

type SignedUrlParam = ps.cloud.SignedUrlParam;
type MethodSignedUrlParam = ps.cloud.MethodSignedUrlParam;
type MsgWithTenantLedger<T extends ps.cloud.MsgWithConnAuth> = ps.cloud.MsgWithTenantLedger<T>;
type MsgWithConnAuth = ps.cloud.MsgWithConnAuth;

export interface PreSignedMsg extends MsgWithTenantLedger<MsgWithConnAuth> {
  readonly methodParam: MethodSignedUrlParam;
  readonly urlParam: SignedUrlParam;
}

// export interface PreSignedConnMsg {
//   readonly params: SignedUrlParam;
//   readonly tid: string;
//   readonly conn: QSId;
// }

export interface PreSignedEnv {
  readonly storageUrl: URI;
  readonly aws: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly region?: string;
  };
  readonly test?: {
    readonly amzDate?: string;
  };
}

export async function calculatePreSignedUrl(psm: PreSignedMsg, env: PreSignedEnv): Promise<Result<URI>> {
  // if (!ipsm.conn) {
  //   return Result.Err(new Error("Connection is not supported"));
  // }
  // const psm = ipsm as PreSignedConnMsg;

  // verify if you are not overriding
  let store: string = psm.methodParam.store;
  if (psm.urlParam.index?.length) {
    store = `${store}-${psm.urlParam.index}`;
  }
  const expiresInSeconds = psm.urlParam.expires || 60 * 60;

  const suffix = "";
  // switch (psm.params.store) {
  //   case "wal":
  //   case "meta":
  //     suffix = ".json";
  //     break;
  //   default:
  //     break;
  // }

  const opUrl = env.storageUrl
    .build()
    // .protocol(vals.protocuol === "ws" ? "http:" : "https:")
    .setParam("X-Amz-Expires", expiresInSeconds.toString())
    .setParam("tid", psm.tid)
    .appendRelative(psm.tenant.tenant)
    .appendRelative(psm.tenant.ledger)
    .appendRelative(store)
    .appendRelative(`${psm.urlParam.key}${suffix}`)
    .URI();
  const a4f = new AwsClient({
    ...env.aws,
    region: env.aws.region || "us-east-1",
    service: "s3",
  });
  const signedUrl = await a4f
    .sign(
      new Request(opUrl.toString(), {
        method: psm.methodParam.method,
      }),
      {
        aws: {
          signQuery: true,
          datetime: env.test?.amzDate,
          // datetime: env.TEST_DATE,
        },
      },
    )
    .then((res) => res.url);
  // console.log("opUrl", opUrl.toString(), psm.methodParams.method, signedUrl, env.aws);
  return Result.Ok(URI.from(signedUrl));
}
