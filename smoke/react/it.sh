#!/bin/sh
set -e
cd smoke/react 
rm -rf node_modules dist
pnpm install
pnpm install -f ../../dist/use-fireproof/use-fireproof-*.tgz
pnpm run test
