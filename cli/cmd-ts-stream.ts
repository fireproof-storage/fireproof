import { command } from "cmd-ts";
import { WrapCmdTSMsg } from "./cmd-evento.js";

export type EnqueueFn<Args extends readonly unknown[], Return, RealReturn = unknown> = (fn: (...a: Args) => RealReturn) => Return;

export interface CliStream<Args extends readonly unknown[], Return, RealReturn = unknown> {
  stream: ReadableStream<RealReturn>;
  enqueue(fn: (...a: Args) => RealReturn): Return;
  close(): Promise<void>;
}

export type HandlerArgsType = Parameters<Parameters<typeof command>[0]["handler"]>;
export type HandlerReturnType = never;

export function cmd_tsStream(): CliStream<HandlerArgsType, HandlerReturnType> {
  const tstream = new TransformStream<WrapCmdTSMsg<unknown>>();
  const writer = tstream.writable.getWriter();
  return {
    stream: tstream.readable,
    close: () => {
      writer.releaseLock();
      return tstream.writable.close();
    },
    enqueue: ((wrappedFunc: (a: unknown) => unknown) => {
      return (args: unknown) => {
        void Promise.resolve(wrappedFunc(args)).then((result) => {
          const cmdTsMsg = {
            type: "msg.cmd-ts",
            cmdTs: {
              raw: args,
              outputFormat: "text",
            },
            result,
          } satisfies WrapCmdTSMsg<unknown>;
          return writer.write(cmdTsMsg);
        });
        return undefined;
      };
    }) as EnqueueFn<HandlerArgsType, HandlerReturnType>,
  };
}
