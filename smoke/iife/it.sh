#!/bin/sh
set -e
cd smoke/iife
smokeDir=$(pwd)
tmpDir=$(mktemp -d)
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir
cp package-template.json package.json
pnpm install
cp $smokeDir/../../dist/fireproof-core/index.global.js ./src/fireproof.js
# pnpm run test > /dev/null 2>&1 || true
pnpm run test
rm -rf $tmpDir
