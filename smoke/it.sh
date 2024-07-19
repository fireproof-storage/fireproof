#!/bin/sh
set -e
cd smoke 
smokeDir=$(pwd)
tmpDir=$(mktemp -d)
cp * $tmpDir || true
cd $tmpDir
rm -rf pnpm-lock.yaml package.json node_modules
pnpm init 
node patch-package.json.mjs 
pnpm install -f $smokeDir/../dist/fireproof-core/fireproof-core-*.tgz
npx tsx ./node-test.ts
rm -rf $tmpDir
