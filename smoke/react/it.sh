#!/bin/sh
set -e
cd smoke/react 
smokeDir=$(pwd)
tmpDir=$(mktemp -d)
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir
cp package-template.json package.json
pnpm install
pnpm install -f $smokeDir/../../dist/use-fireproof/use-fireproof-*.tgz
# pnpm run test > /dev/null 2>&1 || true
pnpm run test
rm -rf $tmpDir
