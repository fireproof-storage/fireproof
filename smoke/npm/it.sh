#!/bin/sh
set -e
projectRoot=$(pwd)
cd smoke/npm
smokeDir=$(pwd)
tmpDir=$(mktemp -d)
cp * $tmpDir || true
cd $tmpDir
cp $projectRoot/dist/npmrc-smoke .npmrc
rm -rf pnpm-lock.yaml node_modules
cp package-template.json package.json
# pnpm install
pnpm add @fireproof/core@$(cat $projectRoot/dist/fp-version)
cat package.json
npx tsx ./node-test.ts
command -v deno && \
  deno run --allow-read --allow-write --allow-env --unstable-sloppy-imports ./node-test.ts
  # deno run --config node_modules/@fireproof/core/deno.json --allow-read --allow-write --allow-env --unstable-sloppy-imports ./node-test.ts
rm -rf $tmpDir
