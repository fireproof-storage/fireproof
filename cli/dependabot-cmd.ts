/* eslint-disable no-console */
import { command, flag, option, string } from "cmd-ts";
import { $ } from "zx";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, WrapCmdTSMsg } from "./cmd-evento.js";

interface PR {
  readonly number: number;
  readonly title: string;
  readonly author: string;
  readonly url: string;
  readonly headRefName: string;
}

async function fetchDependabotPRs(): Promise<PR[]> {
  try {
    const result = await $`gh pr list --author app/dependabot --json number,title,author,url,headRefName --limit 100`;
    const prs = JSON.parse(result.stdout) as PR[];
    return prs;
  } catch (error) {
    console.error("Failed to fetch Dependabot PRs:", error);
    throw error;
  }
}

async function applyPR(pr: PR, rebase: boolean): Promise<void> {
  try {
    console.log(`\nProcessing PR #${pr.number}: ${pr.title}`);

    if (rebase) {
      // Rebase and merge the PR
      await $`gh pr merge ${pr.number} --auto --rebase`;
      console.log(`✓ Rebased and merged PR #${pr.number}`);
    } else {
      // Just checkout the PR
      await $`gh pr checkout ${pr.number}`;
      console.log(`✓ Checked out PR #${pr.number}`);
    }
  } catch (error) {
    console.error(`✗ Failed to process PR #${pr.number}:`, error);
    throw error;
  }
}

export const ReqDependabot = type({
  type: "'core-cli.dependabot'",
});
export type ReqDependabot = typeof ReqDependabot.infer;

export const ResDependabot = type({
  type: "'core-cli.res-dependabot'",
  output: "string",
});
export type ResDependabot = typeof ResDependabot.infer;

export function isResDependabot(u: unknown): u is ResDependabot {
  return !(ResDependabot(u) instanceof type.errors);
}

export const dependabotEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqDependabot, ResDependabot> = {
  hash: "core-cli.dependabot",
  validate: (ctx) => {
    if (!(ReqDependabot(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqDependabot)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDependabot, ResDependabot>): Promise<Result<EventoResultType>> => {
    const args = ctx.request.cmdTs.raw as {
      rebase: boolean;
      apply: boolean;
      prNumber: string;
      list: boolean;
    };

    console.log("Fetching Dependabot PRs...");
    const prs = await fetchDependabotPRs();

    if (prs.length === 0) {
      console.log("No Dependabot PRs found.");
      return sendMsg(ctx, {
        type: "core-cli.res-dependabot",
        output: "No Dependabot PRs found.",
      } satisfies ResDependabot);
    }

    // List mode (default)
    if (args.list || (!args.apply && !args.rebase && !args.prNumber)) {
      console.log(`\nFound ${prs.length} Dependabot PR(s):\n`);
      const lines: string[] = [];
      prs.forEach((pr) => {
        console.log(`#${pr.number}: ${pr.title}`);
        console.log(`  URL: ${pr.url}`);
        console.log(`  Branch: ${pr.headRefName}\n`);
        lines.push(`#${pr.number}: ${pr.title}`);
      });
      return sendMsg(ctx, {
        type: "core-cli.res-dependabot",
        output: `Found ${prs.length} Dependabot PR(s):\n${lines.join("\n")}`,
      } satisfies ResDependabot);
    }

    // Apply specific PR
    if (args.prNumber) {
      const prNum = parseInt(args.prNumber, 10);
      const pr = prs.find((p) => p.number === prNum);
      if (!pr) {
        return Result.Err(`PR #${prNum} not found or is not a Dependabot PR.`);
      }
      await applyPR(pr, args.rebase);
      return sendMsg(ctx, {
        type: "core-cli.res-dependabot",
        output: `Processed PR #${prNum}: ${pr.title}`,
      } satisfies ResDependabot);
    }

    // Apply all PRs
    if (args.apply || args.rebase) {
      console.log(`\nProcessing ${prs.length} Dependabot PR(s)...\n`);
      const processed: number[] = [];
      const skipped: number[] = [];
      for (const pr of prs) {
        try {
          await applyPR(pr, args.rebase);
          processed.push(pr.number);
        } catch (error) {
          console.error(`Skipping PR #${pr.number} due to error.`);
          skipped.push(pr.number);
        }
      }
      console.log("\nDone processing Dependabot PRs.");
      return sendMsg(ctx, {
        type: "core-cli.res-dependabot",
        output: `Processed ${processed.length} PRs, skipped ${skipped.length}.`,
      } satisfies ResDependabot);
    }

    return sendMsg(ctx, {
      type: "core-cli.res-dependabot",
      output: "No action taken.",
    } satisfies ResDependabot);
  },
};

export function dependabotCmd(ctx: CliCtx) {
  const cmd = command({
    name: "dependabot",
    description: "Fetch and apply Dependabot PRs",
    version: "1.0.0",
    args: {
      rebase: flag({
        long: "rebase",
        short: "r",
        description: "Automatically rebase and merge the PRs",
      }),
      apply: flag({
        long: "apply",
        short: "a",
        description: "Apply (checkout) all Dependabot PRs",
      }),
      prNumber: option({
        long: "pr",
        short: "p",
        type: string,
        defaultValue: () => "",
        description: "Apply a specific PR number",
      }),
      list: flag({
        long: "list",
        short: "l",
        description: "List all Dependabot PRs (default action)",
      }),
    },
    handler: ctx.cliStream.enqueue(async (_args) => {
      return {
        type: "core-cli.dependabot",
      } satisfies ReqDependabot;
    }),
  });
  return cmd;
}
