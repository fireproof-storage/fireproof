import { command, subcommands, option, string, flag } from "cmd-ts";
import { $ } from "zx";
import { Result, HandleTriggerCtx, EventoHandler, EventoResultType, Option } from "@adviser/cement";
import { type } from "arktype";
import { CliCtx } from "../cli-ctx.js";
import { sendMsg, sendProgress, WrapCmdTSMsg } from "../cmd-evento.js";
import fs from "fs-extra";

async function getPackageVersion(
  ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqTestContainerTemplate, ResTestContainerTemplate>,
  packageName: string,
): Promise<string | undefined> {
  try {
    const result = await $`pnpm why ${packageName} --json`;
    const data = JSON.parse(result.stdout);

    // pnpm why returns an array of dependency trees
    if (Array.isArray(data) && data.length > 0) {
      const firstEntry = data[0];

      // Look for the package in devDependencies
      if (firstEntry.devDependencies && firstEntry.devDependencies[packageName]) {
        return firstEntry.devDependencies[packageName].version;
      }

      // Look for the package in dependencies
      if (firstEntry.dependencies && firstEntry.dependencies[packageName]) {
        return firstEntry.dependencies[packageName].version;
      }
    }

    return undefined;
  } catch (e) {
    await sendProgress(ctx, "warn", `Failed to get ${packageName} version: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

// --- Build ---

export const ReqTestContainerBuild = type({
  type: "'core-cli.test-container-build'",
});
export type ReqTestContainerBuild = typeof ReqTestContainerBuild.infer;

export const ResTestContainerBuild = type({
  type: "'core-cli.res-test-container-build'",
  output: "string",
});
export type ResTestContainerBuild = typeof ResTestContainerBuild.infer;

export function isResTestContainerBuild(u: unknown): u is ResTestContainerBuild {
  return !(ResTestContainerBuild(u) instanceof type.errors);
}

export const testContainerBuildEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqTestContainerBuild, ResTestContainerBuild> = {
  hash: "core-cli.test-container-build",
  validate: (ctx) => {
    if (!(ReqTestContainerBuild(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqTestContainerBuild)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqTestContainerBuild, ResTestContainerBuild>,
  ): Promise<Result<EventoResultType>> => {
    $.verbose = true;

    await sendProgress(ctx, "info", "Installing required packages...");
    await $`apt-get update`;
    await $`apt-get install -y ca-certificates curl gnupg lsb-release jq rsync`;

    await sendProgress(ctx, "info", "Adding Docker's official GPG key...");
    await $`install -m 0755 -d /etc/apt/keyrings`;
    await $`curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg`;
    await $`chmod a+r /etc/apt/keyrings/docker.gpg`;

    await sendProgress(ctx, "info", "Setting up Docker repository...");
    await $`bash -c 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \\"$VERSION_CODENAME\\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'`;

    await sendProgress(ctx, "info", "Installing Docker Compose plugin...");
    await $`apt-get update`;
    await $`apt-get install -y docker-ce-cli docker-compose-plugin`;

    await sendProgress(ctx, "info", "Verifying Docker installation...");
    await $`docker ps`;
    await $`docker compose version`;

    await sendProgress(ctx, "info", "Checking Playwright version...");
    await $`pnpm exec playwright --version`;

    await sendProgress(ctx, "info", "Configuring git safe directory...");
    await $`git config --global --add safe.directory ${process.cwd()}`;

    return sendMsg(ctx, {
      type: "core-cli.res-test-container-build",
      output: "Test container build completed successfully!",
    } satisfies ResTestContainerBuild);
  },
};

// --- Template ---

export const ReqTestContainerTemplate = type({
  type: "'core-cli.test-container-template'",
  baseImage: "string",
  tag: "string",
  tagSuffix: "string",
  packageName: "string",
  output: "string",
  publish: "boolean",
  repoUrl: "string",
  token: "string",
  actor: "string",
  imageName: "string",
  imageTag: "string",
  context: "string",
});
export type ReqTestContainerTemplate = typeof ReqTestContainerTemplate.infer;

export const ResTestContainerTemplate = type({
  type: "'core-cli.res-test-container-template'",
  output: "string",
});
export type ResTestContainerTemplate = typeof ResTestContainerTemplate.infer;

export function isResTestContainerTemplate(u: unknown): u is ResTestContainerTemplate {
  return !(ResTestContainerTemplate(u) instanceof type.errors);
}

export const testContainerTemplateEvento: EventoHandler<
  WrapCmdTSMsg<unknown>,
  ReqTestContainerTemplate,
  ResTestContainerTemplate
> = {
  hash: "core-cli.test-container-template",
  validate: (ctx) => {
    if (!(ReqTestContainerTemplate(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqTestContainerTemplate)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqTestContainerTemplate, ResTestContainerTemplate>,
  ): Promise<Result<EventoResultType>> => {
    const args = ctx.validated;

    $.verbose = true;

    // Get version from pnpm if tag not provided
    let version = args.tag;
    let detectedVersion: string | undefined;
    if (!version) {
      detectedVersion = await getPackageVersion(ctx, args.packageName);
      if (!detectedVersion) {
        return Result.Err(`Could not detect version for package ${args.packageName}. Please specify --tag explicitly.`);
      }
      version = `v${detectedVersion}`;
      await sendProgress(ctx, "info", `Detected ${args.packageName} version: ${detectedVersion}`);
    }

    // Build full tag with suffix
    const fullTag = args.tagSuffix ? `${version}-${args.tagSuffix}` : version;
    const fullImageName = `${args.baseImage}:${fullTag}`;

    const dockerfile = `FROM ${fullImageName}

# Install required packages
RUN apt-get update && \\
    apt-get install -y ca-certificates curl gnupg lsb-release jq rsync && \\
    rm -rf /var/lib/apt/lists/*

# Add Docker's official GPG key
RUN install -m 0755 -d /etc/apt/keyrings && \\
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \\
    chmod a+r /etc/apt/keyrings/docker.gpg

# Set up Docker repository
RUN echo \\
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \\
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \\
    tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Compose plugin
RUN apt-get update && \\
    apt-get install -y docker-ce-cli docker-compose-plugin && \\
    rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /workspace

# Default command
CMD ["/bin/bash"]
`;

    await fs.writeFile(args.output, dockerfile);
    await sendProgress(ctx, "info", `Dockerfile generated at: ${args.output}`);
    await sendProgress(ctx, "info", `Base image: ${fullImageName}`);

    // If --publish flag is set, build and publish the image
    if (args.publish) {
      if (!args.repoUrl) {
        return Result.Err(
          "Repository URL is required for publishing. Provide via --repo-url or GITHUB_REPOSITORY environment variable.",
        );
      }

      if (!args.token) {
        return Result.Err("GitHub token is required for publishing. Provide via --token or GITHUB_TOKEN environment variable.");
      }

      if (!args.actor) {
        return Result.Err("GitHub actor is required for publishing. Provide via --actor or GITHUB_ACTOR environment variable.");
      }

      const fullImagePath = `${args.repoUrl.toLowerCase()}/${args.actor}/${args.imageName}`;
      // Use detected version (without suffix) as the image tag if available, otherwise use the provided imageTag
      const publishTag = detectedVersion ? detectedVersion : args.imageTag;
      const publishImageTag = `${fullImagePath}:${publishTag}`;

      await sendProgress(ctx, "info", `Checking if image already exists: ${publishImageTag}`);

      // Login to GitHub Container Registry first (needed to check if image exists)
      await sendProgress(ctx, "info", "Logging in to GitHub Container Registry...");
      await $`echo ${args.token} | docker login ghcr.io -u ${args.actor} --password-stdin`;

      // Check if the image with this tag already exists
      try {
        await $`docker manifest inspect ${publishImageTag}`;
        return sendMsg(ctx, {
          type: "core-cli.res-test-container-template",
          output: `Image ${publishImageTag} already exists. Skipping build and push.`,
        } satisfies ResTestContainerTemplate);
      } catch (e) {
        await sendProgress(ctx, "info", `Image ${publishImageTag} does not exist. Proceeding with build and push.`);
      }

      await sendProgress(ctx, "info", `Building and publishing Docker image: ${publishImageTag}`);
      await sendProgress(ctx, "info", `Using Dockerfile: ${args.output}`);
      await sendProgress(ctx, "info", `Build context: ${args.context}`);

      // Build and push the Docker image using buildx
      await sendProgress(ctx, "info", "Building and pushing Docker image with buildx...");
      await $`docker buildx build --push -t ${publishImageTag} -f ${args.output} ${args.context}`;
    }

    return sendMsg(ctx, {
      type: "core-cli.res-test-container-template",
      output: `Dockerfile generated at: ${args.output}, Base image: ${fullImageName}`,
    } satisfies ResTestContainerTemplate);
  },
};

// --- Publish ---

export const ReqTestContainerPublish = type({
  type: "'core-cli.test-container-publish'",
  repoUrl: "string",
  token: "string",
  actor: "string",
  tag: "string",
  dockerfile: "string",
  context: "string",
});
export type ReqTestContainerPublish = typeof ReqTestContainerPublish.infer;

export const ResTestContainerPublish = type({
  type: "'core-cli.res-test-container-publish'",
  output: "string",
});
export type ResTestContainerPublish = typeof ResTestContainerPublish.infer;

export function isResTestContainerPublish(u: unknown): u is ResTestContainerPublish {
  return !(ResTestContainerPublish(u) instanceof type.errors);
}

export const testContainerPublishEvento: EventoHandler<WrapCmdTSMsg<unknown>, ReqTestContainerPublish, ResTestContainerPublish> = {
  hash: "core-cli.test-container-publish",
  validate: (ctx) => {
    if (!(ReqTestContainerPublish(ctx.enRequest) instanceof type.errors)) {
      return Promise.resolve(Result.Ok(Option.Some(ctx.enRequest as ReqTestContainerPublish)));
    }
    return Promise.resolve(Result.Ok(Option.None()));
  },
  handle: async (
    ctx: HandleTriggerCtx<WrapCmdTSMsg<unknown>, ReqTestContainerPublish, ResTestContainerPublish>,
  ): Promise<Result<EventoResultType>> => {
    const args = ctx.validated;

    $.verbose = true;

    if (!args.repoUrl) {
      return Result.Err("Repository URL is required. Provide via --repo-url or GITHUB_REPOSITORY environment variable.");
    }

    if (!args.token) {
      return Result.Err("GitHub token is required. Provide via --token or GITHUB_TOKEN environment variable.");
    }

    if (!args.actor) {
      return Result.Err("GitHub actor is required. Provide via --actor or GITHUB_ACTOR environment variable.");
    }

    const imageName = `ghcr.io/${args.repoUrl.toLowerCase()}`;
    const imageTag = `${imageName}:${args.tag}`;

    await sendProgress(ctx, "info", `Building Docker image: ${imageTag}`);
    await sendProgress(ctx, "info", `Using Dockerfile: ${args.dockerfile}`);
    await sendProgress(ctx, "info", `Build context: ${args.context}`);

    // Login to GitHub Container Registry
    await sendProgress(ctx, "info", "Logging in to GitHub Container Registry...");
    await $`echo ${args.token} | docker login ghcr.io -u ${args.actor} --password-stdin`;

    // Build and push the Docker image using buildx
    await sendProgress(ctx, "info", "Building and pushing Docker image with buildx...");
    await $`docker buildx build --push -t ${imageTag} -f ${args.dockerfile} ${args.context}`;

    return sendMsg(ctx, {
      type: "core-cli.res-test-container-publish",
      output: `Successfully published ${imageTag}`,
    } satisfies ResTestContainerPublish);
  },
};

// --- Commands ---

function testContainerBuildCmd(ctx: CliCtx) {
  const cmd = command({
    name: "build",
    description: "Build test container with Docker and Playwright",
    version: "1.0.0",
    args: {},
    handler: ctx.cliStream.enqueue(() => {
      return {
        type: "core-cli.test-container-build",
      };
    }),
  });
  return cmd;
}

function testContainerTemplateCmd(ctx: CliCtx) {
  const cmd = command({
    name: "template",
    description: "Generate Dockerfile template for test container",
    version: "1.0.0",
    args: {
      baseImage: option({
        long: "base-image",
        short: "b",
        type: string,
        description: "Base Playwright image (without tag)",
        defaultValue: () => "mcr.microsoft.com/playwright",
        defaultValueIsSerializable: true,
      }),
      tag: option({
        long: "tag",
        short: "t",
        type: string,
        description: "Tag for the base Playwright image (leave empty to auto-detect from pnpm)",
        defaultValue: () => "",
        defaultValueIsSerializable: true,
      }),
      tagSuffix: option({
        long: "tag-suffix",
        short: "s",
        type: string,
        description: "Suffix to append to the tag",
        defaultValue: () => "noble",
        defaultValueIsSerializable: true,
      }),
      packageName: option({
        long: "package-name",
        short: "p",
        type: string,
        description: "Package name to query for version",
        defaultValue: () => "playwright",
        defaultValueIsSerializable: true,
      }),
      output: option({
        long: "output",
        short: "o",
        type: string,
        description: "Output path for Dockerfile",
        defaultValue: () => "./Dockerfile",
        defaultValueIsSerializable: true,
      }),
      publish: flag({
        long: "publish",
        description: "Build and publish the image to ghcr.io after generating template",
      }),
      repoUrl: option({
        long: "repo-url",
        short: "r",
        type: string,
        description: "Full repository URL including registry (e.g., ghcr.io/owner/repo) - required if --publish is used",
        defaultValue: () => (process.env.GITHUB_REPOSITORY ? `ghcr.io/${process.env.GITHUB_REPOSITORY}` : ""),
        defaultValueIsSerializable: true,
      }),
      token: option({
        long: "token",
        short: "k",
        type: string,
        description: "GitHub token for authentication - required if --publish is used",
        defaultValue: () => process.env.GITHUB_TOKEN || "",
        defaultValueIsSerializable: true,
      }),
      actor: option({
        long: "actor",
        short: "a",
        type: string,
        description: "GitHub actor (username) - required if --publish is used",
        defaultValue: () => process.env.GITHUB_ACTOR || "",
        defaultValueIsSerializable: true,
      }),
      imageName: option({
        long: "image-name",
        short: "n",
        type: string,
        description: "Docker image name (e.g., 'test-container' or 'my-app')",
        defaultValue: () => "test-container",
        defaultValueIsSerializable: true,
      }),
      imageTag: option({
        long: "image-tag",
        short: "i",
        type: string,
        description: "Docker image tag for publishing",
        defaultValue: () => "latest",
        defaultValueIsSerializable: true,
      }),
      context: option({
        long: "context",
        short: "c",
        type: string,
        description: "Build context directory",
        defaultValue: () => ".",
        defaultValueIsSerializable: true,
      }),
    },
    handler: ctx.cliStream.enqueue((args) => {
      return {
        type: "core-cli.test-container-template",
        ...args,
      };
    }),
  });
  return cmd;
}

function testContainerPublishCmd(ctx: CliCtx) {
  const cmd = command({
    name: "publish",
    description: "Build and publish test container to GitHub Container Registry (ghcr.io)",
    version: "1.0.0",
    args: {
      repoUrl: option({
        long: "repo-url",
        short: "r",
        type: string,
        description: "GitHub repository URL (e.g., owner/repo)",
        defaultValue: () => process.env.GITHUB_REPOSITORY || "",
        defaultValueIsSerializable: true,
      }),
      token: option({
        long: "token",
        short: "t",
        type: string,
        description: "GitHub token for authentication",
        defaultValue: () => process.env.GITHUB_TOKEN || "",
        defaultValueIsSerializable: true,
      }),
      actor: option({
        long: "actor",
        short: "a",
        type: string,
        description: "GitHub actor (username)",
        defaultValue: () => process.env.GITHUB_ACTOR || "",
        defaultValueIsSerializable: true,
      }),
      tag: option({
        long: "tag",
        short: "g",
        type: string,
        description: "Docker image tag",
        defaultValue: () => "latest",
        defaultValueIsSerializable: true,
      }),
      dockerfile: option({
        long: "dockerfile",
        short: "f",
        type: string,
        description: "Path to Dockerfile",
        defaultValue: () => "./Dockerfile",
        defaultValueIsSerializable: true,
      }),
      context: option({
        long: "context",
        short: "c",
        type: string,
        description: "Build context directory",
        defaultValue: () => ".",
        defaultValueIsSerializable: true,
      }),
    },
    handler: ctx.cliStream.enqueue((args) => {
      return {
        type: "core-cli.test-container-publish",
        ...args,
      };
    }),
  });
  return cmd;
}

export function testContainerCmd(ctx: CliCtx) {
  const cmd = subcommands({
    name: "testContainer",
    description: "Test container management for Playwright and Docker",
    version: "1.0.0",
    cmds: {
      template: testContainerTemplateCmd(ctx),
      build: testContainerBuildCmd(ctx),
      publish: testContainerPublishCmd(ctx),
    },
  });
  return cmd;
}
