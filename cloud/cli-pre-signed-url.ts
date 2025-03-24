// small tool to generate pre-signed url for cloud storage
// curl $(npx tsx src/cloud/client/cli-pre-signed-url.ts GET)
// curl -X PUT --data-binary @/etc/protocols  $(npx tsx src/cloud/client/cli-pre-signed-url.ts)
import { BuildURI } from "@adviser/cement";
import { AwsClient } from "aws4fetch";
import { command, option, oneOf, string } from "cmd-ts";
import { SuperThis } from "@fireproof/core";
// import * as t from 'io-ts';

export function preSignedUrlCmd(sthis: SuperThis) {
  return command({
    name: "pre-signed-url",
    description: "sign a url for cloud storage",
    version: "1.0.0",
    args: {
      method: option({
        long: "method",
        type: oneOf(["GET", "PUT", "POST", "DELETE"]),
        defaultValue: () => "PUT",
        defaultValueIsSerializable: true,
      }),
      accessKeyId: option({
        long: "accessKeyId",
        type: string,
        defaultValue: () => sthis.env.get("ACCESS_KEY_ID") || "accessKeyId",
        defaultValueIsSerializable: true,
      }),
      secretAccessKey: option({
        long: "secretAccessKey",
        type: string,
        defaultValue: () => sthis.env.get("SECRET_ACCESS_KEY") || "secretAccessKey",
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
        defaultValue: () => sthis.env.get("STORAGE_URL") || "https://bucket.example.com/db/main",
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
    handler: async (args) => {
      const a4f = new AwsClient({
        accessKeyId: args.accessKeyId,
        secretAccessKey: args.secretAccessKey,
        region: args.region,
        service: args.service,
      });
      const buildUrl = BuildURI.from(args.storageURL).appendRelative(args.path).setParam("X-Amz-Expires", args.expires);

      // eslint-disable-next-line no-console
      console.log(
        await a4f
          .sign(new Request(buildUrl.toString(), { method: args.method }), {
            aws: {
              signQuery: true,
              datetime: args.now,
            },
          })
          .then((res) => res.url),
      );
    },
  });
}
