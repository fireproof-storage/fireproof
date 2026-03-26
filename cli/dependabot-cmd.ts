import { command, flag, option, string } from "cmd-ts";
import { $ } from "zx";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "./cli-ctx.js";
import { sendMsg, sendProgress, WrapCmdTSMsg } from "./cmd-evento.js";

interface PR {
  readonly number: number;
  readonly title: string;
  readonly author: string;
  readonly url: string;
  readonly headRefName: string;
}

async function fetchDependabotPRs(ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDependabot, ResDependabot>): Promise<PR[]> {
  try {
    const result = await $`gh pr list --author app/dependabot --json number,title,author,url,headRefName --limit 100`;
    const prs = JSON.parse(result.stdout) as PR[];
    return prs;
  } catch (error) {
    await sendProgress(ctx, "error", `Failed to fetch Dependabot PRs: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function applyPR(
  ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqDependabot, ResDependabot>,
  pr: PR,
  rebase: boolean,
): Promise<void> {
  try {
    await sendProgress(ctx, "info", `\nProcessing PR #${pr.number}: ${pr.title}`);

    if (rebase) {
      // Rebase and merge the PR
      await $`gh pr merge ${pr.number} --auto --rebase`;
      await sendProgress(ctx, "info", `✓ Rebased and merged PR #${pr.number}`);
    } else {
      // Just checkout the PR
      await $`gh pr checkout ${pr.number}`;
      await sendProgress(ctx, "info", `✓ Checked out PR #${pr.number}`);
    }
  } catch (error) {
    await sendProgress(
      ctx,
      "error",
      `✗ Failed to process PR #${pr.number}: ${error instanceof Error ? error.message : String(error)}`,
    );
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

    await sendProgress(ctx, "info", "Fetching Dependabot PRs...");
    const prs = await fetchDependabotPRs(ctx);

    if (prs.length === 0) {
      return sendMsg(ctx, {
        type: "core-cli.res-dependabot",
        output: "No Dependabot PRs found.",
      } satisfies ResDependabot);
    }

    // List mode (default)
    if (args.list || (!args.apply && !args.rebase && !args.prNumber)) {
      const lines: string[] = [`Found ${prs.length} Dependabot PR(s):`, ""];
      for (const pr of prs) {
        lines.push(`#${pr.number}: ${pr.title}`);
        lines.push(`  URL: ${pr.url}`);
        lines.push(`  Branch: ${pr.headRefName}`);
        lines.push("");
      }
      return sendMsg(ctx, {
        type: "core-cli.res-dependabot",
        output: lines.join("\n"),
      } satisfies ResDependabot);
    }

    // Apply specific PR
    if (args.prNumber) {
      const prNum = parseInt(args.prNumber, 10);
      const pr = prs.find((p) => p.number === prNum);
      if (!pr) {
        return Result.Err(`PR #${prNum} not found or is not a Dependabot PR.`);
      }
      await applyPR(ctx, pr, args.rebase);
      return sendMsg(ctx, {
        type: "core-cli.res-dependabot",
        output: `Processed PR #${prNum}: ${pr.title}`,
      } satisfies ResDependabot);
    }

    // Apply all PRs
    if (args.apply || args.rebase) {
      await sendProgress(ctx, "info", `Processing ${prs.length} Dependabot PR(s)...`);
      const processed: number[] = [];
      const skipped: number[] = [];
      for (const pr of prs) {
        try {
          await applyPR(ctx, pr, args.rebase);
          processed.push(pr.number);
        } catch (error) {
          await sendProgress(ctx, "error", `Skipping PR #${pr.number} due to error.`);
          skipped.push(pr.number);
        }
      }
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
