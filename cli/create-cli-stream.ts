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

export function createCliStream(): CliStream<HandlerArgsType, HandlerReturnType> {
  const tstream = new TransformStream<WrapCmdTSMsg<unknown>>();
  const writer = tstream.writable.getWriter();
  const pending = new Set<Promise<void>>();
  return {
    stream: tstream.readable,
    close: async () => {
      await Promise.allSettled(pending);
      writer.releaseLock();
      await tstream.writable.close();
    },
    enqueue: ((wrappedFunc: (a: unknown) => unknown) => {
      return (args: unknown) => {
        const queued = Promise.resolve(wrappedFunc(args))
          .then((result) => {
            const cmdTsMsg = {
              type: "msg.cmd-ts",
              cmdTs: {
                raw: args,
                outputFormat: "text",
              },
              result,
            } satisfies WrapCmdTSMsg<unknown>;
            return writer.write(cmdTsMsg);
          })
          .then(() => undefined)
          .finally(() => pending.delete(queued));
        pending.add(queued);
        return undefined;
      };
    }) as EnqueueFn<HandlerArgsType, HandlerReturnType>,
  };
}
