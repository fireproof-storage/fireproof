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
  readonly files?: { path: string }[]; // Files modified by the PR
}

interface PRRetryTracker {
  readonly prNumber: number;
  readonly retryCount: number;
  readonly wasFlaky: boolean; // true if it failed then passed on retry
  readonly lastStatus: PRStatus;
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
  } else if (states.some((s) => s === "ERROR")) {
    return "ERROR";
  } else if (states.some((s) => s === "FAILURE")) {
    return "FAILURE";
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

async function fetchDependabotPRs(repo = ""): Promise<PR[]> {
  try {
    let result;
    if (repo) {
      result =
        await $`gh pr list -R ${repo} --author app/dependabot --json number,title,author,url,headRefName,statusCheckRollup,body,mergeable,mergeStateStatus,files --limit 100`;
    } else {
      result =
        await $`gh pr list --author app/dependabot --json number,title,author,url,headRefName,statusCheckRollup,body,mergeable,mergeStateStatus,files --limit 100`;
    }
    const prs = JSON.parse(result.stdout) as PR[];
    return prs;
  } catch (error) {
    console.error("Failed to fetch Dependabot PRs:", error);
    throw error;
  }
}

interface PRDependency {
  prNumber: number;
  dependsOn: number[]; // PR numbers this PR depends on
  reason: string; // Why it depends on them
  priority: number; // Lower number = higher priority (merge first)
}

interface DependencyMap {
  dependencies: PRDependency[];
  mergeOrder: number[]; // Suggested merge order
}

function detectLockfileConflicts(prs: PR[]): DependencyMap {
  const dependencies: PRDependency[] = [];
  const lockfilePattern = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Gemfile\.lock|Cargo\.lock|go\.sum)/;
  const packageFilePattern = /(package\.json|Cargo\.toml|go\.mod|Gemfile)/;

  // Group PRs by whether they modify package files or just lockfiles
  const prsWithPackageFiles: PR[] = [];
  const prsWithOnlyLockfiles: PR[] = [];

  for (const pr of prs) {
    if (!pr.files || pr.files.length === 0) {
      continue;
    }

    const modifiesPackageFile = pr.files.some((f) => packageFilePattern.test(f.path));
    const modifiesLockfile = pr.files.some((f) => lockfilePattern.test(f.path));

    if (modifiesPackageFile) {
      prsWithPackageFiles.push(pr);
    } else if (modifiesLockfile) {
      prsWithOnlyLockfiles.push(pr);
    }
  }

  // PRs that only modify lockfiles should wait for PRs that modify package files
  for (const pr of prsWithOnlyLockfiles) {
    if (prsWithPackageFiles.length > 0) {
      dependencies.push({
        prNumber: pr.number,
        dependsOn: prsWithPackageFiles.map((p) => p.number),
        reason: "Lockfile-only PR should wait for package.json changes",
        priority: 2,
      });
    }
  }

  // Assign priorities: package file changes = 1, lockfile only = 2
  const mergeOrder: number[] = [...prsWithPackageFiles.map((pr) => pr.number), ...prsWithOnlyLockfiles.map((pr) => pr.number)];

  return {
    dependencies,
    mergeOrder,
  };
}

async function waitForPRsToSucceed(prNumbers: number[], timeoutMinutes = 30, repo = ""): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const pollIntervalMs = 10000; // Poll every 10 seconds

  const remainingPRs = new Set(prNumbers);

  console.log(`\n⏳ Waiting for ${prNumbers.length} PR(s) to reach SUCCESS state (timeout: ${timeoutMinutes}m)...`);
  console.log(`   Monitoring PRs: ${Array.from(remainingPRs).join(", ")}\n`);

  while (remainingPRs.size > 0 && Date.now() - startTime < timeoutMs) {
    const prs = await fetchDependabotPRs(repo);
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

async function triggerDependabotRebase(prNumber: number, repo = ""): Promise<void> {
  try {
    if (repo) {
      await $`gh pr comment ${prNumber} -R ${repo} --body "@dependabot rebase"`;
    } else {
      await $`gh pr comment ${prNumber} --body "@dependabot rebase"`;
    }
    console.log(`   Triggered Dependabot rebase for PR #${prNumber}`);
  } catch (error) {
    console.error(`   Failed to trigger rebase for PR #${prNumber}:`, error);
  }
}

async function resolveConflictsAndRebase(prNumber: number, repo = "", regenerateFrozenLockfile = false): Promise<void> {
  try {
    console.log(`\n🔧 Resolving conflicts for PR #${prNumber}...`);

    // Checkout the PR branch (use --force to handle previously force-pushed branches)
    if (repo) {
      await $`gh pr checkout ${prNumber} -R ${repo} --force`;
    } else {
      await $`gh pr checkout ${prNumber} --force`;
    }
    console.log(`   ✓ Checked out PR branch`);

    // Get the current branch name
    const branchResult = await $`git rev-parse --abbrev-ref HEAD`;
    const branchName = branchResult.stdout.trim();
    console.log(`   Current branch: ${branchName}`);

    // Start rebase against main
    try {
      await $`git rebase main`;
      console.log(`   ✓ Rebase completed without conflicts`);
    } catch (error) {
      console.log(`   ⚠️  Rebase has conflicts, attempting to resolve...`);

      // Resolve all conflicts
      try {
        // Get list of conflicting files
        const conflictResult = await $`git diff --name-only --diff-filter=U`;
        const conflictingFiles = conflictResult.stdout
          .trim()
          .split("\n")
          .filter((f) => f);

        if (conflictingFiles.length > 0) {
          console.log(`   🔨 Found ${conflictingFiles.length} conflicting file(s):`);

          // Resolve each conflicting file
          for (const file of conflictingFiles) {
            if (file === "pnpm-lock.yaml") {
              console.log(`      • ${file} - taking version from main and regenerating...`);
              // Use theirs for pnpm-lock.yaml (take the version from main)
              await $`git checkout --theirs ${file}`;
              // Regenerate lock file
              await $`pnpm install`;
            } else {
              console.log(`      • ${file} - taking version from main...`);
              // Use theirs for all other files (take the version from main)
              await $`git checkout --theirs ${file}`;
            }
            // Add the resolved file
            await $`git add ${file}`;
          }
          console.log(`   ✓ Resolved all ${conflictingFiles.length} conflicting file(s)`);
        }

        // Continue rebase with GIT_EDITOR=true to skip editor prompts
        const env = { ...process.env, GIT_EDITOR: "true" };
        await $({ env })`git rebase --continue`;
        console.log(`   ✓ Rebase continued successfully`);
      } catch (conflictError) {
        console.error(`   ✗ Failed to resolve conflicts:`, conflictError);
        throw conflictError;
      }
    }

    // Regenerate frozen lockfile if requested
    if (regenerateFrozenLockfile) {
      console.log(`   🔒 Regenerating frozen lockfile...`);
      try {
        await $`pnpm install --frozen-lockfile=false`;
        await $`git add pnpm-lock.yaml`;
        console.log(`   ✓ Regenerated frozen lockfile`);
      } catch (error) {
        console.error(`   ⚠️  Failed to regenerate frozen lockfile:`, error);
        // Don't throw - this is optional
      }
    }

    // Force push the branch
    console.log(`   📤 Force pushing branch...`);
    await $`git push --force-with-lease origin ${branchName}`;
    console.log(`   ✓ Force pushed to origin/${branchName}`);

    console.log(`✓ PR #${prNumber} rebased and pushed successfully\n`);
  } catch (error) {
    console.error(`✗ Failed to resolve conflicts for PR #${prNumber}:`, error);
    throw error;
  }
}

async function retryFailedPR(prNumber: number, repo = ""): Promise<void> {
  try {
    // Close the PR first
    if (repo) {
      await $`gh pr close ${prNumber} -R ${repo}`;
    } else {
      await $`gh pr close ${prNumber}`;
    }
    console.log(`   ✓ Closed PR #${prNumber}`);

    // Wait for GitHub to process the close
    console.log(`   ⏳ Waiting 30 seconds for GitHub to process...`);
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Reopen the PR to trigger fresh CI
    if (repo) {
      await $`gh pr comment ${prNumber} -R ${repo} --body '@dependabot reopen'`;
    } else {
      await $`gh pr comment ${prNumber} --body '@dependabot reopen'`;
    }
    console.log(`   ↻ Reopened PR #${prNumber} for fresh CI run`);

    // Wait for Dependabot to process the reopen
    console.log(`   ⏳ Waiting 30 seconds for Dependabot to process...`);
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } catch (error) {
    console.error(`   ✗ Failed to close/reopen PR #${prNumber}:`, error);
    throw error;
  }
}

async function deleteDependabotPRs(prNumbers: number[] | null, repo = "", autoReopen = false): Promise<void> {
  try {
    const allPRs = await fetchDependabotPRs(repo);

    // If specific PR numbers provided, filter to those
    let prsToDelete = allPRs;
    if (prNumbers && prNumbers.length > 0) {
      prsToDelete = allPRs.filter((pr) => prNumbers.includes(pr.number));

      if (prsToDelete.length === 0) {
        console.log(`No Dependabot PRs found matching numbers: ${prNumbers.join(", ")}`);
        return;
      }
    }

    if (prsToDelete.length === 0) {
      console.log("No Dependabot PRs found to delete.");
      return;
    }

    console.log(`\n🗑️  Deleting ${prsToDelete.length} Dependabot PR(s)...\n`);

    for (const pr of prsToDelete) {
      try {
        if (repo) {
          await $`gh pr close ${pr.number} -R ${repo}`;
        } else {
          await $`gh pr close ${pr.number}`;
        }
        console.log(`✓ Closed PR #${pr.number}: ${pr.title}`);
      } catch (error) {
        console.error(`✗ Failed to close PR #${pr.number}:`, error);
      }
    }

    console.log(`\n✓ Deleted ${prsToDelete.length} Dependabot PR(s)`);

    if (autoReopen) {
      console.log(`\n⏳ Waiting 30 seconds for GitHub to process closes...\n`);
      await new Promise((resolve) => setTimeout(resolve, 30000));

      console.log(`🔄 Reopening ${prsToDelete.length} Dependabot PR(s)...\n`);

      for (const pr of prsToDelete) {
        try {
          if (repo) {
            await $`gh pr comment ${pr.number} -R ${repo} --body '@dependabot reopen'`;
          } else {
            await $`gh pr comment ${pr.number} --body '@dependabot reopen'`;
          }
          console.log(`✓ Reopened PR #${pr.number}: ${pr.title}`);
        } catch (error) {
          console.error(`✗ Failed to reopen PR #${pr.number}:`, error);
        }
      }

      console.log(`\n⏳ Waiting 30 seconds for Dependabot to process reopens...\n`);
      await new Promise((resolve) => setTimeout(resolve, 30000));

      console.log(`✓ All PRs have been closed and reopened for a fresh start!\n`);
    } else {
      console.log("💡 Dependabot will now create fresh PRs on the next run.\n");
    }
  } catch (error) {
    console.error("Failed to delete Dependabot PRs:", error);
    throw error;
  }
}

async function applyPR(pr: PR, rebase: boolean, useAutoMerge = false, repo = ""): Promise<void> {
  try {
    console.log(`\nProcessing PR #${pr.number}: ${pr.title}`);

    if (rebase) {
      if (useAutoMerge) {
        // Use auto-merge (repository must have it enabled)
        if (repo) {
          await $`gh pr merge ${pr.number} -R ${repo} --auto --rebase`;
        } else {
          await $`gh pr merge ${pr.number} --auto --rebase`;
        }
        console.log(`✓ Enabled auto-merge for PR #${pr.number}`);
      } else {
        // Direct merge
        if (repo) {
          await $`gh pr merge ${pr.number} -R ${repo} --rebase`;
        } else {
          await $`gh pr merge ${pr.number} --rebase`;
        }
        console.log(`✓ Rebased and merged PR #${pr.number}`);
      }
    } else {
      // Just checkout the PR
      if (repo) {
        await $`gh pr checkout ${pr.number} -R ${repo}`;
      } else {
        await $`gh pr checkout ${pr.number}`;
      }
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
      mapDependencies: flag({
        long: "map-dependencies",
        short: "m",
        description: "Analyze and display PR dependencies and suggested merge order",
      }),
      clean: flag({
        long: "clean",
        short: "c",
        description:
          "Delete Dependabot PRs and let Dependabot run fresh (clean slate). Use with --pr to delete specific PR(s), or without to delete all.",
      }),
      cleanPRs: option({
        long: "clean-prs",
        type: string,
        defaultValue: () => "",
        description: "Comma-separated PR numbers to delete (e.g., '1354,1349,1348'). Use with --clean to delete specific PRs.",
      }),
      autoReopen: flag({
        long: "auto-reopen",
        description: "Automatically reopen PRs after closing them (use with --clean). Triggers fresh CI runs.",
      }),
      retryFailed: flag({
        long: "retry-failed",
        description: "Retry failed PRs to detect flaky tests (reopen and wait for fresh CI run)",
      }),
      maxRetries: option({
        long: "max-retries",
        type: string,
        defaultValue: () => "1",
        description: "Maximum number of times to retry a failed PR (default: 1)",
      }),
      repo: option({
        long: "repo",
        type: string,
        defaultValue: () => "",
        description: "Target repository in format 'owner/repo' (e.g., 'VibesDIY/vibes.diy'). Defaults to current directory's repo.",
      }),
      resolveConflicts: flag({
        long: "resolve-conflicts",
        description:
          "Resolve merge conflicts (especially pnpm-lock.yaml) by rebasing against main and auto-fixing lockfiles. Use with --pr to resolve a specific PR.",
      }),
      regenerateFrozenLockfile: flag({
        long: "regenerate-frozen-lockfile",
        description:
          "Regenerate frozen lockfile after resolving conflicts (use with --resolve-conflicts). Useful when lockfile needs to be updated.",
      }),
    },
    handler: async (args) => {
      // Clean mode - delete Dependabot PRs
      if (args.clean) {
        if (args.autoReopen) {
          console.log("🧹 Clean mode: Deleting and reopening Dependabot PRs for fresh start...");
        } else {
          console.log("🧹 Clean mode: Deleting Dependabot PRs...");
        }

        // Parse PR numbers if provided
        let prNumbers: number[] | null = null;
        if (args.cleanPRs) {
          prNumbers = args.cleanPRs
            .split(",")
            .map((n) => parseInt(n.trim(), 10))
            .filter((n) => !isNaN(n));

          if (prNumbers.length === 0) {
            console.error("Invalid PR numbers provided to --clean-prs");
            process.exit(1);
          }
        }

        await deleteDependabotPRs(prNumbers, args.repo, args.autoReopen);
        return;
      }

      // Resolve conflicts mode - rebase and fix lockfile conflicts
      if (args.resolveConflicts) {
        console.log("🔧 Resolve conflicts mode: Rebasing and fixing merge conflicts...\n");
        const prs = await fetchDependabotPRs(args.repo);

        if (args.prNumber) {
          // Resolve conflicts for a specific PR
          const prNum = parseInt(args.prNumber, 10);
          const pr = prs.find((p) => p.number === prNum);
          if (!pr) {
            console.error(`PR #${prNum} not found or is not a Dependabot PR.`);
            process.exit(1);
          }
          await resolveConflictsAndRebase(pr.number, args.repo, args.regenerateFrozenLockfile);
        } else {
          // Resolve conflicts for all conflicting PRs
          const conflictingPRs = prs.filter((pr) => pr.mergeable === "CONFLICTING");
          if (conflictingPRs.length === 0) {
            console.log("✓ No conflicting PRs found.\n");
            return;
          }

          console.log(`Found ${conflictingPRs.length} PR(s) with conflicts:\n`);
          for (const pr of conflictingPRs) {
            try {
              await resolveConflictsAndRebase(pr.number, args.repo, args.regenerateFrozenLockfile);
            } catch (error) {
              console.error(`⚠️  Failed to resolve PR #${pr.number}, skipping...`);
            }
          }
        }
        return;
      }

      // Retry failed PRs mode - detect flaky tests
      if (args.retryFailed) {
        console.log("🔄 Retry mode: Detecting flaky tests...\n");
        const maxRetries = parseInt(args.maxRetries, 10) || 1;
        const prs = await fetchDependabotPRs(args.repo);

        // Find failed PRs
        const failedPRs = prs.filter((pr) => {
          const status = getOverallStatus(pr);
          return status === "FAILURE" || status === "ERROR";
        });

        if (failedPRs.length === 0) {
          console.log("✓ No failed PRs found to retry.");
          return;
        }

        console.log(`Found ${failedPRs.length} failed PR(s). Retrying with fresh CI runs...\n`);
        const flakyPRs: PRRetryTracker[] = [];

        for (const pr of failedPRs) {
          console.log(`Retrying PR #${pr.number}: ${pr.title}`);

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`  Attempt ${attempt}/${maxRetries}:`);

            // Reopen the PR to trigger fresh CI
            await retryFailedPR(pr.number, args.repo);

            // Wait for CI to complete
            console.log(`  ⏳ Waiting 3 minutes for CI to run...`);
            await new Promise((resolve) => setTimeout(resolve, 180000));

            // Check new status
            const refreshedPRs = await fetchDependabotPRs(args.repo);
            const refreshedPR = refreshedPRs.find((p) => p.number === pr.number);

            if (refreshedPR) {
              const newStatus = getOverallStatus(refreshedPR);
              console.log(`  Result: ${newStatus}`);

              if (newStatus === "SUCCESS") {
                console.log(`  ✓ FLAKY TEST DETECTED! PR #${pr.number} passed on retry\n`);
                flakyPRs.push({
                  prNumber: pr.number,
                  retryCount: attempt,
                  wasFlaky: true,
                  lastStatus: newStatus,
                });
                break; // Success, no need to retry further
              } else if (attempt < maxRetries) {
                console.log(`  Retrying...\n`);
              } else {
                console.log(`  ✗ Still failing after ${maxRetries} attempt(s)\n`);
                flakyPRs.push({
                  prNumber: pr.number,
                  retryCount: attempt,
                  wasFlaky: false,
                  lastStatus: newStatus,
                });
              }
            }
          }
        }

        // Summary
        console.log("\n" + "=".repeat(50));
        console.log("Flaky Test Report:\n");
        const flakyCount = flakyPRs.filter((p) => p.wasFlaky).length;
        const stillFailingCount = flakyPRs.filter((p) => !p.wasFlaky).length;

        if (flakyCount > 0) {
          console.log(`✓ ${flakyCount} flaky PR(s) detected (passed on retry):`);
          flakyPRs
            .filter((p) => p.wasFlaky)
            .forEach((p) => {
              const pr = failedPRs.find((fp) => fp.number === p.prNumber);
              if (pr) {
                console.log(`  #${p.prNumber}: ${pr.title} (passed on attempt ${p.retryCount})`);
              }
            });
          console.log();
        }

        if (stillFailingCount > 0) {
          console.log(`✗ ${stillFailingCount} PR(s) still failing after retries:`);
          flakyPRs
            .filter((p) => !p.wasFlaky)
            .forEach((p) => {
              const pr = failedPRs.find((fp) => fp.number === p.prNumber);
              if (pr) {
                console.log(`  #${p.prNumber}: ${pr.title} (${p.lastStatus})`);
              }
            });
        }
        return;
      }

      console.log("Fetching Dependabot PRs...");
      const prs = await fetchDependabotPRs(args.repo);

      // Map dependencies mode
      if (args.mapDependencies) {
        console.log(`\nAnalyzing dependencies for ${prs.length} Dependabot PR(s)...\n`);
        const depMap = detectLockfileConflicts(prs);

        if (depMap.dependencies.length === 0) {
          console.log("✓ No lockfile conflicts detected between PRs.\n");
        } else {
          console.log(`Found ${depMap.dependencies.length} PR(s) with potential lockfile conflicts:\n`);
          depMap.dependencies.forEach((dep) => {
            console.log(`PR #${dep.prNumber}:`);
            console.log(`  Should wait for: ${dep.dependsOn.map((n) => `#${n}`).join(", ")}`);
            console.log(`  Reason: ${dep.reason}`);
            console.log();
          });
        }

        console.log("Suggested merge order (merge in this sequence):");
        console.log(depMap.mergeOrder.map((n) => `#${n}`).join(" → "));
        console.log();

        // Show PR details in merge order
        console.log("PRs in suggested merge order:");
        depMap.mergeOrder.forEach((prNum, index) => {
          const pr = prs.find((p) => p.number === prNum);
          if (pr) {
            const status = getOverallStatus(pr);
            const statusEmoji =
              status === "SUCCESS"
                ? "✓"
                : status === "FAILURE"
                  ? "✗"
                  : status === "PENDING"
                    ? "○"
                    : status === "REBASE-PENDING"
                      ? "⚠️ "
                      : "?";
            const modifiesPackageJson = pr.files?.some((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
            const typeLabel = modifiesPackageJson ? "[DIRECT DEP]" : "[TRANSITIVE]";
            console.log(`${index + 1}. ${statusEmoji} ${typeLabel} PR #${prNum}: ${pr.title}`);
          }
        });
        console.log();
        return;
      }

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

            const checkCount = pr.statusCheckRollup?.length ?? 0;
            console.log(`  Status: ${statusEmoji} ${overallStatus} (${checkCount} check${checkCount !== 1 ? "s" : ""})`);
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
        await applyPR(pr, args.rebase, args.autoGH && autoMergeAvailable, args.repo);
        return;
      }

      // Apply all PRs
      if (args.apply || args.rebase) {
        if (args.rebase && (args.autoCLI || args.autoGH)) {
          // Clean flow: show initial summary, then process with minimal output
          const initialPRs = [...prs]; // Keep original list for final summary

          // Analyze dependencies and get smart merge order
          const depMap = detectLockfileConflicts(prs);
          console.log(`\n📊 Dependency Analysis:`);
          if (depMap.dependencies.length > 0) {
            console.log(`   Found ${depMap.dependencies.length} PR(s) with lockfile dependencies`);
            console.log(`   Suggested merge order: ${depMap.mergeOrder.map((n) => `#${n}`).join(" → ")}`);
          } else {
            console.log(`   No lockfile conflicts detected`);
          }

          // Reorder PRs according to smart merge order
          const orderedPRs = depMap.mergeOrder
            .map((prNum) => prs.find((pr) => pr.number === prNum))
            .filter((pr): pr is PR => pr !== undefined);

          // Categorize initial PRs
          const successPRs = orderedPRs.filter((pr) => getOverallStatus(pr) === "SUCCESS");
          const pendingPRs = orderedPRs.filter((pr) => {
            const status = getOverallStatus(pr);
            return status === "PENDING" || status === "REBASE-PENDING";
          });
          const failedPRs = orderedPRs.filter((pr) => {
            const status = getOverallStatus(pr);
            return status === "FAILURE" || status === "ERROR";
          });

          const totalToProcess = successPRs.length + pendingPRs.length + failedPRs.length;
          console.log(
            `\nProcessing ${successPRs.length} SUCCESS PRs, waiting for ${pendingPRs.length} PENDING, ${failedPRs.length} FAILED (will retry)\n`,
          );

          // Trigger rebase on FAILED PRs that are direct dependencies (modify package.json)
          const directDepFailedPRs = failedPRs.filter((pr) =>
            pr.files?.some((f) => f.path === "package.json" || f.path.endsWith("/package.json")),
          );
          if (directDepFailedPRs.length > 0) {
            console.log(`🔄 Triggering rebase on ${directDepFailedPRs.length} failed direct dependency PR(s):`);
            for (const pr of directDepFailedPRs) {
              console.log(`   PR #${pr.number}: ${pr.title}`);
              await triggerDependabotRebase(pr.number, args.repo);
            }
            console.log(`   Waiting 2 minutes for Dependabot to rebase and CI to run...\n`);
            await new Promise((resolve) => setTimeout(resolve, 120000));

            // After waiting, check if any PRs transitioned to SUCCESS or PENDING
            console.log(`   Checking PR status after rebase...`);
            const refreshedPRs = await fetchDependabotPRs(args.repo);
            const rebasedPRNumbers = directDepFailedPRs.map((pr) => pr.number);
            for (const prNum of rebasedPRNumbers) {
              const pr = refreshedPRs.find((p) => p.number === prNum);
              if (pr) {
                const status = getOverallStatus(pr);
                console.log(`   PR #${prNum}: ${status}`);
              }
            }
            console.log();
          }

          let processed = 0;
          const processedPRs = new Set<number>();
          const permanentlyFailedPRs = new Set<number>(); // Only skip after multiple failures

          // With --autoCLI, continuously process PRs until none are left
          // Use ordered PRs for smart merge order
          let remainingPRs = orderedPRs;
          const failedToApply = new Set<number>(); // Track PRs that failed to apply

          while (remainingPRs.length > 0) {
            // Categorize PRs
            const currentSuccessPRs = remainingPRs.filter(
              (pr) => getOverallStatus(pr) === "SUCCESS" && !processedPRs.has(pr.number),
            );
            const currentPendingPRs = remainingPRs.filter((pr) => {
              const status = getOverallStatus(pr);
              return (status === "PENDING" || status === "REBASE-PENDING") && !processedPRs.has(pr.number);
            });

            // Process SUCCESS PRs first
            if (currentSuccessPRs.length > 0) {
              console.log(`Rebasing ${currentSuccessPRs.length} PR(s) with SUCCESS status:\n`);
              for (const pr of currentSuccessPRs) {
                try {
                  processed++;
                  console.log(`Processing [${processed}/${totalToProcess}]: PR #${pr.number}`);
                  await applyPR(pr, true, args.autoGH && autoMergeAvailable, args.repo);
                  processedPRs.add(pr.number);
                  failedToApply.delete(pr.number);
                } catch (error) {
                  const errorMsg = String(error);
                  if (errorMsg.includes("not mergeable")) {
                    console.error(`✗ PR #${pr.number} is not mergeable (needs rebase), will wait for Dependabot...`);
                    failedToApply.add(pr.number);
                  } else {
                    console.error(`✗ Failed to apply PR #${pr.number}, will retry in next iteration.`);
                    failedToApply.add(pr.number);
                  }
                }
              }

              // After merging PRs, wait for Dependabot to rebase the remaining ones
              if (processedPRs.size > 0 && failedToApply.size > 0) {
                console.log(
                  `\n⏳ Waiting 60 seconds for Dependabot to automatically rebase ${failedToApply.size} PR(s) after base branch changes...\n`,
                );
                await new Promise((resolve) => setTimeout(resolve, 60000));
              }
            }

            // Wait for pending PRs if any
            if (currentPendingPRs.length > 0) {
              const pendingNumbers = currentPendingPRs.map((pr) => pr.number);
              console.log(`Waiting for CI checks on ${currentPendingPRs.length} PRs...`);
              await waitForPRsToSucceed(pendingNumbers, 30, args.repo);
            }

            // Refresh the PR list
            const newRemainingPRs = await fetchDependabotPRs(args.repo);

            // If no PRs left, we're done
            if (newRemainingPRs.length === 0) {
              console.log("\n✓ All PRs have been merged or closed!");
              break;
            }

            // Check if we made progress or have PRs that need retry
            const unprocessedPRs = newRemainingPRs.filter(
              (pr) => !processedPRs.has(pr.number) && !permanentlyFailedPRs.has(pr.number),
            );

            // Continue if there are unprocessed PRs OR PRs that failed to apply (need rebase)
            const hasWorkToDo = unprocessedPRs.length > 0 || failedToApply.size > 0;

            if (!hasWorkToDo) {
              console.log("\n✓ No more PRs to process.");
              break;
            }

            // Reorder remaining PRs according to dependency map
            const newDepMap = detectLockfileConflicts(newRemainingPRs);
            remainingPRs = newDepMap.mergeOrder
              .map((prNum) => newRemainingPRs.find((pr) => pr.number === prNum))
              .filter((pr): pr is PR => pr !== undefined);

            // Brief pause to avoid API hammering
            if (currentSuccessPRs.length === 0 && currentPendingPRs.length === 0) {
              console.log("⏳ No PRs ready to merge, waiting 30 seconds before retry...");
              await new Promise((resolve) => setTimeout(resolve, 30000));
            }
          }

          // Final summary with two sections
          console.log("\n" + "=".repeat(50));
          console.log(`\nCompleted processing ${initialPRs.length} Dependabot PR(s):\n`);

          const finalProcessedPRs = initialPRs.filter((pr) => processedPRs.has(pr.number));
          const finalSkippedPRs = initialPRs.filter((pr) => permanentlyFailedPRs.has(pr.number) || failedToApply.has(pr.number));

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
              await applyPR(pr, args.rebase, args.autoGH && autoMergeAvailable, args.repo);
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
