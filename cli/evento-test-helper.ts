import { AppContext, EventoSendProvider, HandleTriggerCtx, Result } from "@adviser/cement";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { CliCtx } from "./cli-ctx.js";
import { cmd_tsStream } from "./cmd-ts-stream.js";
import { cmdTsEvento, WrapCmdTSMsg } from "./cmd-evento.js";

export class TestSendProvider implements EventoSendProvider<unknown, unknown, unknown> {
  readonly results: WrapCmdTSMsg<unknown>[] = [];
  async send<IS, OS>(_trigger: HandleTriggerCtx<unknown, unknown, unknown>, data: IS): Promise<Result<OS, Error>> {
    this.results.push(data as WrapCmdTSMsg<unknown>);
    return Promise.resolve(Result.Ok());
  }
  done(_trigger: HandleTriggerCtx<unknown, unknown, unknown>): Promise<Result<void>> {
    return Promise.resolve(Result.Ok());
  }
}

export async function triggerEvento(opts: { reqType: string; raw: unknown }): Promise<WrapCmdTSMsg<unknown>> {
  const evento = cmdTsEvento();
  const send = new TestSendProvider();
  const sthis = ensureSuperThis();
  const ctx: CliCtx = { sthis, cliStream: cmd_tsStream() };
  const appCtx = new AppContext().set("cliCtx", ctx);

  const request: WrapCmdTSMsg<unknown> = {
    type: "msg.cmd-ts",
    cmdTs: { raw: opts.raw, outputFormat: "text" },
    result: { type: opts.reqType },
  };

  await evento.trigger({ ctx: appCtx, send, request });
  const result = send.results[send.results.length - 1];
  if (!result) {
    throw new Error(`No evento response emitted for ${opts.reqType}`);
  }
  return result;
}
