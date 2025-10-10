/* eslint-disable no-console */
import { command, subcommands, option, string, flag } from "cmd-ts";
import { $ } from "zx";
import { SuperThis } from "@fireproof/core-types-base";
import fs from "fs-extra";

function buildCmd(sthis: SuperThis) {
  const cmd = command({
    name: "build",
    description: "Build test container with Docker and Playwright",
    version: "1.0.0",
    args: {},
    handler: async () => {
      $.verbose = true;

      console.log("Installing required packages...");
      await $`apt-get update`;
      await $`apt-get install -y ca-certificates curl gnupg lsb-release jq rsync`;

      console.log("Adding Docker's official GPG key...");
      await $`install -m 0755 -d /etc/apt/keyrings`;
      await $`curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg`;
      await $`chmod a+r /etc/apt/keyrings/docker.gpg`;

      console.log("Setting up Docker repository...");
      await $`bash -c 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \\"$VERSION_CODENAME\\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'`;

      console.log("Installing Docker Compose plugin...");
      await $`apt-get update`;
      await $`apt-get install -y docker-ce-cli docker-compose-plugin`;

      console.log("Verifying Docker installation...");
      await $`docker ps`;
      await $`docker compose version`;

      console.log("Checking Playwright version...");
      await $`pnpm exec playwright --version`;

      console.log("Configuring git safe directory...");
      await $`git config --global --add safe.directory ${process.cwd()}`;

      console.log("Test container build completed successfully!");
    },
  });
  return cmd;
}

async function getPackageVersion(packageName: string): Promise<string | undefined> {
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
    console.warn(`Failed to get ${packageName} version:`, e);
    return undefined;
  }
}

function templateCmd(sthis: SuperThis) {
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
    handler: async (args) => {
      $.verbose = true;

      // Get version from pnpm if tag not provided
      let version = args.tag;
      let detectedVersion: string | undefined;
      if (!version) {
        detectedVersion = await getPackageVersion(args.packageName);
        if (!detectedVersion) {
          throw new Error(`Could not detect version for package ${args.packageName}. Please specify --tag explicitly.`);
        }
        version = `v${detectedVersion}`;
        console.log(`Detected ${args.packageName} version: ${detectedVersion}`);
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
      console.log(`Dockerfile generated at: ${args.output}`);
      console.log(`Base image: ${fullImageName}`);

      // If --publish flag is set, build and publish the image
      if (args.publish) {
        if (!args.repoUrl) {
          throw new Error(
            "Repository URL is required for publishing. Provide via --repo-url or GITHUB_REPOSITORY environment variable.",
          );
        }

        if (!args.token) {
          throw new Error("GitHub token is required for publishing. Provide via --token or GITHUB_TOKEN environment variable.");
        }

        if (!args.actor) {
          throw new Error("GitHub actor is required for publishing. Provide via --actor or GITHUB_ACTOR environment variable.");
        }

        const fullImagePath = `${args.repoUrl.toLowerCase()}/${args.actor}/${args.imageName}`;
        // Use detected version (without suffix) as the image tag if available, otherwise use the provided imageTag
        const publishTag = detectedVersion ? detectedVersion : args.imageTag;
        const publishImageTag = `${fullImagePath}:${publishTag}`;

        console.log(`Checking if image already exists: ${publishImageTag}`);

        // Login to GitHub Container Registry first (needed to check if image exists)
        console.log("Logging in to GitHub Container Registry...");
        await $`echo ${args.token} | docker login ghcr.io -u ${args.actor} --password-stdin`;

        // Check if the image with this tag already exists
        try {
          await $`docker manifest inspect ${publishImageTag}`;
          console.log(`Image ${publishImageTag} already exists. Skipping build and push.`);
          return;
        } catch (e) {
          console.log(`Image ${publishImageTag} does not exist. Proceeding with build and push.`);
        }

        console.log(`Building and publishing Docker image: ${publishImageTag}`);
        console.log(`Using Dockerfile: ${args.output}`);
        console.log(`Build context: ${args.context}`);

        // Build and push the Docker image using buildx
        console.log("Building and pushing Docker image with buildx...");
        await $`docker buildx build --push -t ${publishImageTag} -f ${args.output} ${args.context}`;

        console.log(`Successfully published ${publishImageTag}`);
      }
    },
  });
  return cmd;
}

function publishCmd(sthis: SuperThis) {
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
    handler: async (args) => {
      $.verbose = true;

      if (!args.repoUrl) {
        throw new Error("Repository URL is required. Provide via --repo-url or GITHUB_REPOSITORY environment variable.");
      }

      if (!args.token) {
        throw new Error("GitHub token is required. Provide via --token or GITHUB_TOKEN environment variable.");
      }

      if (!args.actor) {
        throw new Error("GitHub actor is required. Provide via --actor or GITHUB_ACTOR environment variable.");
      }

      const imageName = `ghcr.io/${args.repoUrl.toLowerCase()}`;
      const imageTag = `${imageName}:${args.tag}`;

      console.log(`Building Docker image: ${imageTag}`);
      console.log(`Using Dockerfile: ${args.dockerfile}`);
      console.log(`Build context: ${args.context}`);

      // Login to GitHub Container Registry
      console.log("Logging in to GitHub Container Registry...");
      await $`echo ${args.token} | docker login ghcr.io -u ${args.actor} --password-stdin`;

      // Build and push the Docker image using buildx
      console.log("Building and pushing Docker image with buildx...");
      await $`docker buildx build --push -t ${imageTag} -f ${args.dockerfile} ${args.context}`;

      console.log(`Successfully published ${imageTag}`);
    },
  });
  return cmd;
}

export function testContainerCmd(sthis: SuperThis) {
  const cmd = subcommands({
    name: "testContainer",
    description: "Test container management for Playwright and Docker",
    version: "1.0.0",
    cmds: {
      template: templateCmd(sthis),
      build: buildCmd(sthis),
      publish: publishCmd(sthis),
    },
  });
  return cmd;
}
