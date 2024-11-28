#!/bin/sh
set -e
cd smoke/esm
smokeDir=$(pwd)

if which docker-compose
then
  dockerCompose="docker-compose"
else
  dockerCompose="docker compose"
fi
$dockerCompose up -d
packageDir=../../dist/fireproof-core

token=$(curl \
     --retry 10 --retry-max-time 30 --retry-all-errors \
     -X PUT \
     -H "Content-type: application/json" \
     -d '{ "name": "admin", "password": "admin" }' \
     'http://localhost:4873/-/user/org.couchdb.user:admin' | jq .token)

cat <<EOF > $packageDir/.npmrc
; .npmrc
enable-pre-post-scripts=true
//localhost:4873/:_authToken=$token
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
$dockerCompose down
