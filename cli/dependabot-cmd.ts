/* eslint-disable no-console */
import { command, flag, option, string } from "cmd-ts";
import { $ } from "zx";
import { SuperThis } from "@fireproof/core-types-base";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function dependabotCmd(sthis: SuperThis) {
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
    handler: async (args) => {
      console.log("Fetching Dependabot PRs...");
      const prs = await fetchDependabotPRs();

      if (prs.length === 0) {
        console.log("No Dependabot PRs found.");
        return;
      }

      // List mode (default)
      if (args.list || (!args.apply && !args.rebase && !args.prNumber)) {
        console.log(`\nFound ${prs.length} Dependabot PR(s):\n`);
        prs.forEach((pr) => {
          console.log(`#${pr.number}: ${pr.title}`);
          console.log(`  URL: ${pr.url}`);
          console.log(`  Branch: ${pr.headRefName}\n`);
        });
        return;
      }

      // Apply specific PR
      if (args.prNumber) {
        const prNum = parseInt(args.prNumber, 10);
        const pr = prs.find((p) => p.number === prNum);
        if (!pr) {
          console.error(`PR #${prNum} not found or is not a Dependabot PR.`);
          process.exit(1);
        }
        await applyPR(pr, args.rebase);
        return;
      }

      // Apply all PRs
      if (args.apply || args.rebase) {
        console.log(`\nProcessing ${prs.length} Dependabot PR(s)...\n`);
        for (const pr of prs) {
          try {
            await applyPR(pr, args.rebase);
          } catch (error) {
            console.error(`Skipping PR #${pr.number} due to error.`);
          }
        }
        console.log("\nDone processing Dependabot PRs.");
      }
    },
  });
  return cmd;
}
