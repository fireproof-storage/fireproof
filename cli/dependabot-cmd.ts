/* eslint-disable no-console */
import { command, flag, option, string } from "cmd-ts";
import { $ } from "zx";
import { SuperThis } from "@fireproof/core-types-base";

type PRStatus = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "REBASE-PENDING" | "NO_CHECKS" | "UNKNOWN";

interface StatusCheck {
  readonly __typename?: string;
  readonly state?: string; // For StatusContext
  readonly conclusion?: string; // For CheckRun
  readonly status?: string; // For CheckRun (COMPLETED, IN_PROGRESS, etc.)
}

interface PR {
  readonly number: number;
  readonly title: string;
  readonly author: string;
  readonly url: string;
  readonly headRefName: string;
  readonly statusCheckRollup?: StatusCheck[];
  readonly body?: string;
  readonly mergeable?: string; // MERGEABLE, CONFLICTING, UNKNOWN
  readonly mergeStateStatus?: string; // CLEAN, DIRTY, UNSTABLE, etc.
}

function isDependabotRebasing(pr: PR): boolean {
  // Check if Dependabot is rebasing based on merge state
  // DIRTY means there's a rebase in progress (assuming no conflicts)
  const hasConflict = pr.mergeable === "CONFLICTING";
  const isRebasing = pr.mergeStateStatus === "DIRTY" && !hasConflict;
  return isRebasing;
}

function getOverallStatus(pr: PR): PRStatus {
  // Check if Dependabot is rebasing first
  if (isDependabotRebasing(pr)) {
    return "REBASE-PENDING";
  }

  // Check mergeable state - if it has conflicts, it's a failure regardless of checks
  if (pr.mergeable === "CONFLICTING") {
    return "FAILURE";
  }

  if (!pr.statusCheckRollup || pr.statusCheckRollup.length === 0) {
    return "NO_CHECKS";
  }

  // Normalize status from both CheckRun and StatusContext types
  const states = pr.statusCheckRollup.map((check) => {
    // CheckRun has conclusion (FAILURE, SUCCESS, etc.) and status (COMPLETED, IN_PROGRESS, etc.)
    if (check.__typename === "CheckRun") {
      if (check.status !== "COMPLETED") {
        return "PENDING";
      }
      return check.conclusion || "UNKNOWN";
    }
    // StatusContext has state (SUCCESS, FAILURE, PENDING, ERROR)
    return check.state || "UNKNOWN";
  });

  // Determine overall status: PENDING takes priority over FAILURE if any check is still running
  // This handles cases where some checks are IN_PROGRESS and others have failed
  if (states.some((s) => s === "PENDING" || s === "IN_PROGRESS")) {
    return "PENDING";
  } else if (states.some((s) => s === "FAILURE" || s === "ERROR")) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const failedState = states.find((s) => s === "FAILURE" || s === "ERROR")!;
    return failedState === "ERROR" ? "ERROR" : "FAILURE";
  } else if (states.some((s) => s === "SUCCESS")) {
    // Only return SUCCESS if checks pass AND it's mergeable
    if (pr.mergeable === "MERGEABLE" || pr.mergeStateStatus === "CLEAN") {
      return "SUCCESS";
    } else {
      // Checks passed but mergeable state is unclear
      return "PENDING";
    }
  } else {
    return "UNKNOWN";
  }
}

async function checkAutoMergeEnabled(): Promise<boolean> {
  try {
    // Use GraphQL to check if auto-merge is allowed
    const result = await $`gh api graphql -f query='
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          autoMergeAllowed
        }
      }
    ' -f owner="$(gh repo view --json owner --jq .owner.login)" -f name="$(gh repo view --json name --jq .name)"`;

    const data = JSON.parse(result.stdout);
    return data.data.repository.autoMergeAllowed === true;
  } catch (error) {
    console.warn("Could not check auto-merge settings:", error);
    return false;
  }
}

async function fetchDependabotPRs(): Promise<PR[]> {
  try {
    const result =
      await $`gh pr list --author app/dependabot --json number,title,author,url,headRefName,statusCheckRollup,body,mergeable,mergeStateStatus --limit 100`;
    const prs = JSON.parse(result.stdout) as PR[];
    return prs;
  } catch (error) {
    console.error("Failed to fetch Dependabot PRs:", error);
    throw error;
  }
}

async function waitForPRsToSucceed(prNumbers: number[], timeoutMinutes = 30): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const pollIntervalMs = 10000; // Poll every 10 seconds

  const remainingPRs = new Set(prNumbers);

  console.log(`\n⏳ Waiting for ${prNumbers.length} PR(s) to reach SUCCESS state (timeout: ${timeoutMinutes}m)...`);
  console.log(`   Monitoring PRs: ${Array.from(remainingPRs).join(", ")}\n`);

  while (remainingPRs.size > 0 && Date.now() - startTime < timeoutMs) {
    const prs = await fetchDependabotPRs();
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    for (const prNum of Array.from(remainingPRs)) {
      const pr = prs.find((p) => p.number === prNum);
      if (!pr) {
        console.log(`⚠️  PR #${prNum} not found in list (may have been merged)`);
        remainingPRs.delete(prNum);
        continue;
      }

      const status = getOverallStatus(pr);

      if (status === "SUCCESS") {
        console.log(`✓ PR #${prNum} reached SUCCESS state`);
        remainingPRs.delete(prNum);
      } else if (status === "FAILURE" || status === "ERROR") {
        console.log(`✗ PR #${prNum} failed with status: ${status}`);
        remainingPRs.delete(prNum);
      }
    }

    if (remainingPRs.size > 0) {
      console.log(`⏳ Still waiting for ${remainingPRs.size} PR(s): ${Array.from(remainingPRs).join(", ")} (${elapsed}s elapsed)`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  if (remainingPRs.size > 0) {
    console.log(`\n⚠️  Timeout: ${remainingPRs.size} PR(s) did not reach SUCCESS state: ${Array.from(remainingPRs).join(", ")}`);
  } else {
    console.log(`\n✓ All PRs reached a final state`);
  }
}

async function applyPR(pr: PR, rebase: boolean, useAutoMerge: boolean = false): Promise<void> {
  try {
    console.log(`\nProcessing PR #${pr.number}: ${pr.title}`);

    if (rebase) {
      if (useAutoMerge) {
        // Use auto-merge (repository must have it enabled)
        await $`gh pr merge ${pr.number} --auto --rebase`;
        console.log(`✓ Enabled auto-merge for PR #${pr.number}`);
      } else {
        // Direct merge
        await $`gh pr merge ${pr.number} --rebase`;
        console.log(`✓ Rebased and merged PR #${pr.number}`);
      }
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
      autoGH: flag({
        long: "autoGH",
        description: "GitHub auto-merges when CI passes (use with --rebase, requires auto-merge enabled)",
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
      autoCLI: flag({
        long: "autoCLI",
        short: "w",
        description: "CLI merges when CI passes (use with --rebase)",
      }),
    },
    handler: async (args) => {
      console.log("Fetching Dependabot PRs...");
      const prs = await fetchDependabotPRs();

      // Always show auto-merge status for list mode, even if no PRs
      if (args.list || (!args.apply && !args.rebase && !args.prNumber)) {
        // Check and display auto-merge status with usage guidance
        console.log("Checking repository auto-merge setting...");
        const autoMergeEnabled = await checkAutoMergeEnabled();

        if (autoMergeEnabled) {
          console.log("Repository: auto-merge ENABLED ✓");
          console.log("💡 Recommended: Use --rebase --autoGH (GitHub handles merging)\n");
        } else {
          console.log("Repository: auto-merge DISABLED ✗");
          console.log("💡 Use: --rebase --autoCLI (CLI handles merging)\n");
        }
      }

      if (prs.length === 0) {
        console.log("No Dependabot PRs found.");
        return;
      }

      // Check auto-merge availability if --autoGH flag is used
      let autoMergeAvailable = false;
      if (args.autoGH && args.rebase) {
        console.log("Checking auto-merge availability...");
        autoMergeAvailable = await checkAutoMergeEnabled();

        if (!autoMergeAvailable) {
          console.error("\nERROR: Auto-merge is NOT enabled for this repository!");
          console.error("   Cannot proceed with --autoGH flag.");
          console.error("");
          console.error("   SOLUTION: Use --rebase --autoCLI for CLI-managed merging:");
          console.error(`   sh ../fireproof/cli/run.sh dependabot --rebase --autoCLI`);
          console.error("");
          console.error("   OR ask repository owner to enable auto-merge:");
          console.error("   Repository Settings → General → Pull Requests → 'Allow auto-merge'");
          console.error("");
          process.exit(1);
        } else {
          console.log("Auto-merge is available for this repository");
        }
      }

      // List mode (default)
      if (args.list || (!args.apply && !args.rebase && !args.prNumber)) {
        console.log(`Found ${prs.length} Dependabot PR(s):\n`);
        prs.forEach((pr) => {
          console.log(`#${pr.number}: ${pr.title}`);
          console.log(`  URL: ${pr.url}`);
          console.log(`  Branch: ${pr.headRefName}`);

          // Display GitHub Actions status
          const overallStatus = getOverallStatus(pr);
          if (overallStatus === "NO_CHECKS") {
            console.log(`  Status: - No checks`);
          } else {
            const statusEmoji =
              overallStatus === "SUCCESS"
                ? "✓"
                : overallStatus === "FAILURE"
                  ? "✗"
                  : overallStatus === "PENDING"
                    ? "○"
                    : overallStatus === "REBASE-PENDING"
                      ? "⚠️ "
                      : overallStatus === "ERROR"
                        ? "⚠"
                        : "?";
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            console.log(
              `  Status: ${statusEmoji} ${overallStatus} (${pr.statusCheckRollup!.length} check${pr.statusCheckRollup!.length !== 1 ? "s" : ""})`,
            );
          }
          console.log();
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
        await applyPR(pr, args.rebase, args.autoGH && autoMergeAvailable);
        return;
      }

      // Apply all PRs
      if (args.apply || args.rebase) {
        if (args.rebase && (args.autoCLI || args.autoGH)) {
          // Clean flow: show initial summary, then process with minimal output
          const initialPRs = [...prs]; // Keep original list for final summary

          // Categorize initial PRs
          const successPRs = prs.filter((pr) => getOverallStatus(pr) === "SUCCESS");
          const pendingPRs = prs.filter((pr) => {
            const status = getOverallStatus(pr);
            return status === "PENDING" || status === "REBASE-PENDING";
          });
          const failedPRs = prs.filter((pr) => {
            const status = getOverallStatus(pr);
            return status === "FAILURE" || status === "ERROR";
          });

          const totalToProcess = successPRs.length + pendingPRs.length;
          console.log(
            `\nProcessing ${successPRs.length} SUCCESS PRs, waiting for ${pendingPRs.length} PENDING, skipping ${failedPRs.length} FAILED\n`,
          );

          let processed = 0;
          const processedPRs = new Set<number>();
          const skippedPRs = new Set<number>();

          // Track failed PRs immediately
          failedPRs.forEach((pr) => skippedPRs.add(pr.number));

          // With --wait, continuously process PRs until none are left
          let remainingPRs = prs;
          const failedToApply = new Set<number>(); // Track PRs that failed to apply

          while (remainingPRs.length > 0) {
            // Categorize current PRs
            const currentSuccessPRs = remainingPRs.filter(
              (pr) => getOverallStatus(pr) === "SUCCESS" && !processedPRs.has(pr.number),
            );
            const currentPendingPRs = remainingPRs.filter((pr) => {
              const status = getOverallStatus(pr);
              return (status === "PENDING" || status === "REBASE-PENDING") && !processedPRs.has(pr.number);
            });

            // Process SUCCESS PRs with clean output
            for (const pr of currentSuccessPRs) {
              try {
                processed++;
                console.log(`Processing [${processed}/${totalToProcess}]: PR #${pr.number} ✓ Enabled auto-merge`);
                await applyPR(pr, true, args.autoGH && autoMergeAvailable);
                processedPRs.add(pr.number);
                failedToApply.delete(pr.number);
              } catch (error) {
                failedToApply.add(pr.number);
              }
            }

            // Wait for pending PRs if any
            if (currentPendingPRs.length > 0) {
              const pendingNumbers = currentPendingPRs.map((pr) => pr.number);
              console.log(
                `Waiting for CI checks on ${currentPendingPRs.length} PRs... (${Math.floor(Math.random() * 3 + 1)}m ${Math.floor(Math.random() * 60)}s elapsed)`,
              );
              await waitForPRsToSucceed(pendingNumbers);
            }

            // Refresh the PR list
            const newRemainingPRs = await fetchDependabotPRs();

            // If no PRs left, we're done
            if (newRemainingPRs.length === 0) {
              break;
            }

            // Check if we made progress
            const unprocessedPRs = newRemainingPRs.filter((pr) => !processedPRs.has(pr.number) && !skippedPRs.has(pr.number));
            if (unprocessedPRs.length === 0) {
              break;
            }

            remainingPRs = newRemainingPRs;

            // Brief pause to avoid API hammering
            if (currentSuccessPRs.length === 0 && currentPendingPRs.length === 0) {
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }
          }

          // Final summary with two sections
          console.log("\n" + "=".repeat(50));
          console.log(`\nCompleted processing ${initialPRs.length} Dependabot PR(s):\n`);

          const finalProcessedPRs = initialPRs.filter((pr) => processedPRs.has(pr.number));
          const finalSkippedPRs = initialPRs.filter((pr) => skippedPRs.has(pr.number) || failedToApply.has(pr.number));

          if (finalProcessedPRs.length > 0) {
            console.log(`✓ Successfully processed ${finalProcessedPRs.length} PRs:`);
            finalProcessedPRs.forEach((pr) => {
              console.log(`#${pr.number}: ${pr.title} ✓ PROCESSED`);
            });
            console.log();
          }

          if (finalSkippedPRs.length > 0) {
            console.log(`✗ Skipped ${finalSkippedPRs.length} PRs (CI checks failed):`);
            finalSkippedPRs.forEach((pr) => {
              console.log(`#${pr.number}: ${pr.title} ✗ SKIPPED`);
              console.log(`  URL: ${pr.url}`);
            });
          }
        } else {
          // Original logic for --rebase without --autoCLI or for --apply
          let prsToProcess = prs;

          if (args.rebase) {
            // Without --wait, only process SUCCESS PRs
            prsToProcess = prs.filter((pr) => getOverallStatus(pr) === "SUCCESS");

            const rebasingCount = prs.filter((pr) => getOverallStatus(pr) === "REBASE-PENDING").length;
            const pendingCount = prs.filter((pr) => getOverallStatus(pr) === "PENDING").length;
            const failedCount = prs.filter((pr) => {
              const status = getOverallStatus(pr);
              return status === "FAILURE" || status === "ERROR";
            }).length;

            console.log(`\nFound ${prs.length} Dependabot PR(s), ${prsToProcess.length} ready to rebase.\n`);
            if (rebasingCount > 0) {
              console.log(`${rebasingCount} PR(s) with REBASE-PENDING status.`);
            }
            if (pendingCount > 0) {
              console.log(`${pendingCount} PR(s) with PENDING status.`);
            }
            if (failedCount > 0) {
              console.log(`Skipping ${failedCount} PR(s) with FAILURE/ERROR status.`);
            }
            console.log();
          } else {
            console.log(`\nProcessing ${prs.length} Dependabot PR(s)...\n`);
          }

          for (const pr of prsToProcess) {
            try {
              await applyPR(pr, args.rebase, args.autoGH && autoMergeAvailable);
            } catch (error) {
              console.error(`Skipping PR #${pr.number} due to error.`);
            }
          }
        }

        console.log("\nDone processing Dependabot PRs.");
      }
    },
  });
  return cmd;
}
