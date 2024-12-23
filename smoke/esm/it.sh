#!/bin/sh
set -e
projectRoot=$(pwd)
cd smoke/esm
smokeDir=$(pwd)

tmpDir=$(mktemp -d)
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir
cp $projectRoot/dist/npmrc-smoke .npmrc
cp package-template.json package.json
pnpm install
#pnpm add '@fireproof/core'
pnpm run test
rm -rf $tmpDir
