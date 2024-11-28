#!/bin/sh
set -e
cd smoke/iife
smokeDir=$(pwd)
if which docker-compose
then
  docker-compose up -d
else
  docker compose up -d
fi
packageDir=../../dist/fireproof-core
cat <<EOF > $packageDir/.npmrc
; .npmrc
enable-pre-post-scripts=true
@fireproof:registry=http://localhost:4873
EOF
(cd $packageDir && pnpm publish --no-git-checks)

tmpDir=$(mktemp -d)
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir
cp package-template.json package.json
pnpm install
pnpm run test
rm -rf $tmpDir
cd $smokeDir
docker-compose down
