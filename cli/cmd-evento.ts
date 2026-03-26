import { Evento, EventoResult, EventoResultType, HandleTriggerCtx, Result } from "@adviser/cement";
import { type } from "arktype";

import { wellKnownEvento } from "./well-known-cmd.js";
import { writeEnvEvento } from "./write-env-cmd.js";
import { keyEvento } from "./cloud-token-key-cmd.js";
import { preSignedUrlEvento } from "./pre-signed-url.js";
import { retryEvento } from "./retry-cmd.js";
import { dependabotEvento } from "./dependabot-cmd.js";
import { updateDepsEvento } from "./update-deps-cmd.js";
import { setScriptsEvento, setDependenciesEvento } from "./set-scripts-cmd.js";
import { tscEvento } from "./tsc-cmd.js";
import { testContainerBuildEvento, testContainerTemplateEvento, testContainerPublishEvento } from "./test-container-cmd.js";
import {
  deviceIdCreateEvento,
  deviceIdCsrEvento,
  deviceIdExportEvento,
  deviceIdCertEvento,
  deviceIdCaCertEvento,
  deviceIdRegisterEvento,
} from "./device-id-cmd.js";
import { buildEvento } from "./build-cmd.js";

export const CmdTSMsg = type({
  type: "'msg.cmd-ts'",
  cmdTs: type({
    raw: "unknown",
    outputFormat: "'json'|'text'",
  }),
  result: "unknown",
});
export type CmdTSMsg = typeof CmdTSMsg.infer;
export function isCmdTSMsg(u: unknown): u is CmdTSMsg {
  return !(CmdTSMsg(u) instanceof type.errors);
}
export type WrapCmdTSMsg<T> = Omit<CmdTSMsg, "result"> & { result: T };

export const CmdProgress = type({
  type: "'core-cli.progress'",
  level: "'info'|'warn'|'error'",
  message: "string",
});
export type CmdProgress = typeof CmdProgress.infer;

export function isCmdProgress(u: unknown): u is CmdProgress {
  return !(CmdProgress(u) instanceof type.errors);
}

export async function sendMsg<Q, S>(
  ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, Q, S>,
  result: S,
): Promise<Result<EventoResultType>> {
  await ctx.send.send(ctx, {
    ...ctx.request,
    result,
  } satisfies WrapCmdTSMsg<S>);
  return Result.Ok(EventoResult.Continue);
}

export async function sendProgress<Q, S>(
  ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, Q, S>,
  level: CmdProgress["level"],
  message: string,
): Promise<void> {
  await ctx.send.send(ctx, {
    ...ctx.request,
    result: {
      type: "core-cli.progress",
      level,
      message,
    } satisfies CmdProgress,
  } satisfies WrapCmdTSMsg<CmdProgress>);
}

export function cmdTsEvento() {
  const evento = new Evento({
    encode: (i) => {
      if (isCmdTSMsg(i)) {
        return Promise.resolve(Result.Ok(i.result));
      }
      return Promise.resolve(Result.Err("not a cmd-ts-msg"));
    },
    decode: (i) => Promise.resolve(Result.Ok(i)),
  });
  evento.push([
    wellKnownEvento,
    writeEnvEvento,
    keyEvento,
    preSignedUrlEvento,
    retryEvento,
    dependabotEvento,
    updateDepsEvento,
    setScriptsEvento,
    setDependenciesEvento,
    tscEvento,
    testContainerBuildEvento,
    testContainerTemplateEvento,
    testContainerPublishEvento,
    deviceIdCreateEvento,
    deviceIdCsrEvento,
    deviceIdExportEvento,
    deviceIdCertEvento,
    deviceIdCaCertEvento,
    deviceIdRegisterEvento,
    buildEvento,
  ]);
  return evento;
}
