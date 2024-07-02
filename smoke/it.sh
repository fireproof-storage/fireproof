#!/bin/sh
set -e
cd smoke 
rm -rf package.json node_modules
pnpm init 
node patch-package.json.mjs 
pnpm install -f ../dist/fireproof-core/fireproof-core-*.tgz
npx tsx ./node-test.ts
