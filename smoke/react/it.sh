#!/bin/sh
set -e
cd smoke/react 
rm -rf node_modules dist pnpm-lock.yaml
cp package-template.json package.json
pnpm install
pnpm install -f ../../dist/use-fireproof/use-fireproof-*.tgz
pnpm run test > /dev/null 2>&1 || true
pnpm run test
