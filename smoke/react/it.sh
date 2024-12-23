#!/bin/sh
set -e
projectRoot=$(pwd)
cd smoke/react 
smokeDir=$(pwd)
tmpDir=$(mktemp -d)
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir
cp $projectRoot/dist/npmrc-smoke .npmrc
cp package-template.json package.json
pnpm install --registry=http://localhost:4873/
# pnpm run test > /dev/null 2>&1 || true
pnpm run test
rm -rf $tmpDir
