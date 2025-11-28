/* eslint-disable no-console */
import { command, option, number, restPositionals } from "cmd-ts";
import { SuperThis } from "@fireproof/core-types-base";
import { $ } from "zx";
import { timeouted, isSuccess, isTimeout, isAborted, isError } from "@adviser/cement";

export function retryCmd(_sthis: SuperThis) {
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
    handler: async function (args) {
      const retryCount = args.retry;
      const timeoutSec = args.timeout;

      if (isNaN(retryCount) || retryCount < 1) {
        console.error("Error: --retry must be a positive number");
        process.exit(1);
      }

      if (isNaN(timeoutSec) || timeoutSec < 0) {
        console.error("Error: --timeout must be a non-negative number");
        process.exit(1);
      }

      if (!args.command || args.command.length === 0) {
        console.error("Error: No command specified");
        process.exit(1);
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
            process.exit(0);
            break;
          }

          case isTimeout(result): {
            console.error(`[Attempt ${attempt}/${maxAttempts}] Command timed out after ${timeoutSec}s`);
            if (isLastAttempt) {
              console.error(`All ${maxAttempts} attempts failed. Last failure: timeout`);
              process.exit(124);
            }
            break;
          }

          case isAborted(result): {
            console.error(`[Attempt ${attempt}/${maxAttempts}] Command was aborted`);
            if (isLastAttempt) {
              console.error(`All ${maxAttempts} attempts failed. Last failure: aborted`);
              process.exit(130);
            }
            break;
          }

          case isError(result): {
            const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
            console.error(`[Attempt ${attempt}/${maxAttempts}] Command failed: ${errorMsg}`);
            if (isLastAttempt) {
              console.error(`All ${maxAttempts} attempts failed. Last failure: ${errorMsg}`);
              process.exit(1);
            }
            break;
          }

          default: {
            throw new Error("Unhandled result state");
          }
        }
      }
    },
  });
}
