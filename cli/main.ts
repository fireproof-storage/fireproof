/* eslint-disable no-console */
import { AppContext, EventoSendProvider, HandleTriggerCtx, processStream, Result } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { dotenv } from "zx";
import { runSafely, subcommands } from "cmd-ts";
import { err, isErr } from "cmd-ts/dist/cjs/Result.js";

import { cmd_tsStream } from "./cmd-ts-stream.js";
import { CliCtx } from "./cli-ctx.js";
import { cmdTsEvento, isCmdProgress, WrapCmdTSMsg } from "./cmd-evento.js";

import { buildCmd, isResBuild } from "./build-cmd.js";
import { setDependenciesCmd, setScriptsCmd, isResSetScripts, isResSetDependencies } from "./set-scripts-cmd.js";
import { handleTsc, tscCmd, isResTsc } from "./tsc-cmd.js";
import { writeEnvCmd, isResWriteEnv } from "./write-env-cmd.js";
import { keyCmd, isResKey } from "./cloud-token-key-cmd.js";
import { preSignedUrlCmd, isResPreSignedUrl } from "./pre-signed-url.js";
import { dependabotCmd, isResDependabot } from "./dependabot-cmd.js";
import {
  testContainerCmd,
  isResTestContainerBuild,
  isResTestContainerTemplate,
  isResTestContainerPublish,
} from "./test-container-cmd.js";
import {
  deviceIdCmd,
  isResDeviceIdCreate,
  isResDeviceIdCsr,
  isResDeviceIdExport,
  isResDeviceIdCert,
  isResDeviceIdCaCert,
  isResDeviceIdRegister,
} from "./device-id-cmd.js";
import { wellKnownCmd, isResWellKnown } from "./well-known-cmd.js";
import { retryCmd, isResRetry } from "./retry-cmd.js";
import { updateDepsCmd, isResUpdateDeps } from "./update-deps-cmd.js";

class OutputSelector implements EventoSendProvider<unknown, unknown, unknown> {
  readonly tstream = new TransformStream<unknown, WrapCmdTSMsg<unknown>>();
  readonly outputStream: ReadableStream<WrapCmdTSMsg<unknown>> = this.tstream.readable;
  readonly writer = this.tstream.writable.getWriter();
  async send<IS, OS>(_trigger: HandleTriggerCtx<unknown, unknown, unknown>, data: IS): Promise<Result<OS, Error>> {
    await this.writer.write(data);
    return Promise.resolve(Result.Ok());
  }
  done(_trigger: HandleTriggerCtx<unknown, unknown, unknown>): Promise<Result<void>> {
    this.writer.releaseLock();
    this.tstream.writable.close();
    return Promise.resolve(Result.Ok());
  }
}

async function main() {
  dotenv.config(process.env.FP_ENV ?? ".env");
  const sthis = ensureSuperThis();

  // tsc bypass: called directly before cmd-ts runs
  if (process.argv[2] === "tsc") {
    return handleTsc(process.argv.slice(3), sthis);
  }

  const ctx: CliCtx = {
    sthis,
    cliStream: cmd_tsStream(),
  };

  const rs = await runSafely(
    subcommands({
      name: "core-cli",
      description: "fireproof/core-cli",
      version: "1.0.0",
      cmds: {
        tsc: tscCmd(ctx),
        key: keyCmd(ctx),
        writeEnv: writeEnvCmd(ctx),
        preSigned: preSignedUrlCmd(ctx),
        build: buildCmd(ctx),
        setScripts: setScriptsCmd(ctx),
        setDependencies: setDependenciesCmd(ctx),
        dependabot: dependabotCmd(ctx),
        testContainer: testContainerCmd(ctx),
        deviceId: deviceIdCmd(ctx),
        wellKnown: wellKnownCmd(ctx),
        retry: retryCmd(ctx),
        updateDeps: updateDepsCmd(ctx),
      },
    }),
    process.argv.slice(2),
  );
  if (isErr(rs)) {
    console.error(err(rs).error.error.config.message);
    process.exit(err(rs).error.error.config.exitCode);
  }

  const outputSelector = new OutputSelector();
  const evento = cmdTsEvento();
  const appCtx = new AppContext().set("cliCtx", ctx);

  await Promise.all([
    processStream(
      ctx.cliStream.stream,
      async (msg) => {
        const triggered = await evento.trigger({
          ctx: appCtx,
          send: outputSelector,
          request: msg,
        });
        if (triggered.isErr()) {
          throw triggered.Err();
        }
        const triggerCtx = triggered.unwrap();
        if (triggerCtx.error) {
          throw triggerCtx.error;
        }
      },
      processStream(outputSelector.outputStream, async (wmsg) => {
        const msg = wmsg.result;
        if (isCmdProgress(msg)) {
          switch (msg.level) {
            case "warn":
              console.warn(msg.message);
              break;
            case "error":
              console.error(msg.message);
              break;
            case "info":
            default:
              console.log(msg.message);
              break;
          }
          return;
        }
        switch (true) {
          case isResWellKnown(msg):
          case isResWriteEnv(msg):
          case isResKey(msg):
          case isResPreSignedUrl(msg):
          case isResDependabot(msg):
          case isResUpdateDeps(msg):
          case isResSetScripts(msg):
          case isResSetDependencies(msg):
          case isResTsc(msg):
          case isResTestContainerBuild(msg):
          case isResTestContainerTemplate(msg):
          case isResTestContainerPublish(msg):
          case isResDeviceIdCreate(msg):
          case isResDeviceIdCsr(msg):
          case isResDeviceIdExport(msg):
          case isResDeviceIdCert(msg):
          case isResDeviceIdCaCert(msg):
          case isResDeviceIdRegister(msg):
          case isResBuild(msg): {
            if (msg.output) {
              console.log(msg.output);
            }
            break;
          }
          case isResRetry(msg): {
            if (msg.output) {
              console.log(msg.output);
            }
            process.exit(msg.exitCode);
            break;
          }
        }
      }),
    ),
    ctx.cliStream.close(),
  ]);
}

main()
  .catch((e) => {
    console.error("Error in core-cli:", e);
    process.exit(1);
  })
  .then(() => process.exit(0));
