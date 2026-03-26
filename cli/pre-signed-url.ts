// small tool to generate pre-signed url for cloud storage
// curl $(npx tsx src/cloud/client/cli-pre-signed-url.ts GET)
// curl -X PUT --data-binary @/etc/protocols  $(npx tsx src/cloud/client/cli-pre-signed-url.ts)
import { BuildURI, Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { AwsClient } from "aws4fetch";
import { command, option, oneOf, string } from "cmd-ts";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "./cmd-evento.js";

export const ReqPreSignedUrl = type({
  type: "'core-cli.req-pre-signed-url'",
});
export type ReqPreSignedUrl = typeof ReqPreSignedUrl.infer;

export const ResPreSignedUrl = type({
  type: "'core-cli.res-pre-signed-url'",
  output: "string",
});
export type ResPreSignedUrl = typeof ResPreSignedUrl.infer;

export function isResPreSignedUrl(u: unknown): u is ResPreSignedUrl {
  return !(ResPreSignedUrl(u) instanceof type.errors);
}

export const preSignedUrlEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqPreSignedUrl, ResPreSignedUrl> = {
  hash: "core-cli.req-pre-signed-url",
  validate: (ctx) => {
    if (!(ReqPreSignedUrl(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqPreSignedUrl)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqPreSignedUrl, ResPreSignedUrl>,
  ): Promise<Result<EventoResultType>> => {
    const args = ctx.request.cmdTs.raw as {
      method: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
      service: string;
      storageURL: string;
      path: string;
      expires: string;
      now: string;
    };

    const a4f = new AwsClient({
      accessKeyId: args.accessKeyId,
      secretAccessKey: args.secretAccessKey,
      region: args.region,
      service: args.service,
    });
    const buildUrl = BuildURI.from(args.storageURL).appendRelative(args.path).setParam("X-Amz-Expires", args.expires);

    const output = await a4f
      .sign(new Request(buildUrl.toString(), { method: args.method }), {
        aws: {
          signQuery: true,
          datetime: args.now,
        },
      })
      .then((res) => res.url);

    return sendMsg(ctx, {
      type: "core-cli.res-pre-signed-url",
      output,
    } satisfies ResPreSignedUrl);
  },
};

export function preSignedUrlCmd(ctx: CliCtx) {
  return command({
    name: "pre-signed-url",
    description: "sign a url for cloud storage",
    version: "1.0.0",
    args: {
      method: option({
        long: "method",
        type: oneOf(["GET", "PUT", "POST", "DELETE"]) as never,
        defaultValue: () => "PUT",
        defaultValueIsSerializable: true,
      }),
      accessKeyId: option({
        long: "accessKeyId",
        type: string,
        defaultValue: () => ctx.sthis.env.get("ACCESS_KEY_ID") || "accessKeyId",
        defaultValueIsSerializable: true,
      }),
      secretAccessKey: option({
        long: "secretAccessKey",
        type: string,
        defaultValue: () => ctx.sthis.env.get("SECRET_ACCESS_KEY") || "secretAccessKey",
        defaultValueIsSerializable: true,
      }),
      region: option({
        long: "region",
        type: string,
        defaultValue: () => "us-east-1",
        defaultValueIsSerializable: true,
      }),
      service: option({
        long: "service",
        type: string,
        defaultValue: () => "s3",
        defaultValueIsSerializable: true,
      }),
      storageURL: option({
        long: "storageURL",
        type: string,
        defaultValue: () => ctx.sthis.env.get("STORAGE_URL") || "https://bucket.example.com/db/main",
        defaultValueIsSerializable: true,
      }),
      path: option({
        long: "path",
        type: string,
        defaultValue: () => "db/main",
        defaultValueIsSerializable: true,
      }),
      expires: option({
        long: "expires",
        type: string,
        defaultValue: () => "3600",
        defaultValueIsSerializable: true,
      }),
      now: option({
        long: "now",
        type: {
          async from(str): Promise<string> {
            const decoded = new Date(str);
            if (isNaN(decoded.getTime())) {
              throw new Error("invalid date");
            }
            // 2021-09-01T12:34:56Z
            return decoded
              .toISOString()
              .replace(/[-:]/g, "")
              .replace(/\.\d+Z$/, "Z");
          },
          displayName: "WithoutMillis",
          description: "without milliseconds",
        },
        // 2021-09-01T12:34:56Z
        // 2024-11-17T07:21:10.958Z
        defaultValue: () =>
          new Date()
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d+Z$/, "Z"),
        defaultValueIsSerializable: true,
      }),
    },
    handler: ctx.cliStream.enqueue(async (_args) => {
      return {
        type: "core-cli.req-pre-signed-url",
      } satisfies ReqPreSignedUrl;
    }),
  });
}
