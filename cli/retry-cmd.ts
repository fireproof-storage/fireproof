/* eslint-disable no-console */
import { command, option, number, restPositionals } from "cmd-ts";
import { $ } from "zx";
import {
  timeouted,
  isSuccess,
  isTimeout,
  isAborted,
  isError,
  Result,
  HandleTriggerCtx,
  EventoHandler,
  EventoResultType,
  Option,
} from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "./cmd-evento.js";

export const ReqRetry = type({
  type: "'core-cli.retry'",
});
export type ReqRetry = typeof ReqRetry.infer;

export const ResRetry = type({
  type: "'core-cli.res-retry'",
  output: "string",
  exitCode: "number",
});
export type ResRetry = typeof ResRetry.infer;

export function isResRetry(u: unknown): u is ResRetry {
  return !(ResRetry(u) instanceof type.errors);
}

export const retryEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqRetry, ResRetry> = {
  hash: "core-cli.retry",
  validate: (ctx) => {
    if (!(ReqRetry(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqRetry)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqRetry, ResRetry>): Promise<Result<EventoResultType>> => {
    const args = ctx.request.cmdTs.raw as {
      retry: number;
      timeout: number;
      command: string[];
    };

    const retryCount = args.retry;
    const timeoutSec = args.timeout;

    if (isNaN(retryCount) || retryCount < 1) {
      console.error("Error: --retry must be a positive number");
      return sendMsg(ctx, {
        type: "core-cli.res-retry",
        output: "Error: --retry must be a positive number",
        exitCode: 1,
      } satisfies ResRetry);
    }

    if (isNaN(timeoutSec) || timeoutSec < 0) {
      console.error("Error: --timeout must be a non-negative number");
      return sendMsg(ctx, {
        type: "core-cli.res-retry",
        output: "Error: --timeout must be a non-negative number",
        exitCode: 1,
      } satisfies ResRetry);
    }

    if (!args.command || args.command.length === 0) {
      console.error("Error: No command specified");
      return sendMsg(ctx, {
        type: "core-cli.res-retry",
        output: "Error: No command specified",
        exitCode: 1,
      } satisfies ResRetry);
    }

    const commandStr = args.command.join(" ");
    const maxAttempts = retryCount;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isLastAttempt = attempt === maxAttempts;

      console.log(`[Attempt ${attempt}/${maxAttempts}] Running: ${commandStr}`);

      const executeCommand = async () => {
        $.verbose = true;
        const result = await $`${args.command}`.nothrow();

        if (result.exitCode !== 0) {
          throw new Error(`Command failed with exit code ${result.exitCode}`);
        }

        return result;
      };

      const result = await timeouted(executeCommand(), { timeout: timeoutSec * 1000 });

      switch (true) {
        case isSuccess(result): {
          console.log(`[Attempt ${attempt}/${maxAttempts}] Command succeeded`);
          return sendMsg(ctx, {
            type: "core-cli.res-retry",
            output: "Command succeeded",
            exitCode: 0,
          } satisfies ResRetry);
        }

        case isTimeout(result): {
          console.error(`[Attempt ${attempt}/${maxAttempts}] Command timed out after ${timeoutSec}s`);
          if (isLastAttempt) {
            const msg = `All ${maxAttempts} attempts failed. Last failure: timeout`;
            console.error(msg);
            return sendMsg(ctx, {
              type: "core-cli.res-retry",
              output: msg,
              exitCode: 124,
            } satisfies ResRetry);
          }
          break;
        }

        case isAborted(result): {
          console.error(`[Attempt ${attempt}/${maxAttempts}] Command was aborted`);
          if (isLastAttempt) {
            const msg = `All ${maxAttempts} attempts failed. Last failure: aborted`;
            console.error(msg);
            return sendMsg(ctx, {
              type: "core-cli.res-retry",
              output: msg,
              exitCode: 130,
            } satisfies ResRetry);
          }
          break;
        }

        case isError(result): {
          const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
          console.error(`[Attempt ${attempt}/${maxAttempts}] Command failed: ${errorMsg}`);
          if (isLastAttempt) {
            const msg = `All ${maxAttempts} attempts failed. Last failure: ${errorMsg}`;
            console.error(msg);
            return sendMsg(ctx, {
              type: "core-cli.res-retry",
              output: msg,
              exitCode: 1,
            } satisfies ResRetry);
          }
          break;
        }

        default: {
          return Result.Err("Unhandled result state");
        }
      }
    }

    return Result.Err("Unexpected end of retry loop");
  },
};

export function retryCmd(ctx: CliCtx) {
  return command({
    name: "retry",
    description: "Execute a command with retry logic and timeout support.",
    args: {
      retry: option({
        long: "retry",
        short: "r",
        description: "Number of retry attempts (default: 2)",
        type: number,
        defaultValue: () => 2,
      }),
      timeout: option({
        long: "timeout",
        short: "t",
        description: "Timeout in seconds for each attempt (0 = no timeout)",
        type: number,
        defaultValue: () => 0,
      }),
      command: restPositionals({
        description: "Command and arguments to execute",
        displayName: "command",
      }),
    },
    handler: ctx.cliStream.enqueue(async (_args) => {
      return {
        type: "core-cli.retry",
      } satisfies ReqRetry;
    }),
  });
}
