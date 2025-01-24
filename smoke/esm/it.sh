#!/bin/sh
set -e
projectBase=$(pwd)
cd smoke/esm
smokeDir=$(pwd)

#if which docker-compose
#then
#  dockerCompose="docker-compose"
#else
#  dockerCompose="docker compose"
#fi

#cat > .env <<EOF
#PROJECT_BASE=$projectBase
#EOF
#mkdir -p $projectBase/.esm-cache/vd $projectBase/.esm-cache/esm
#chmod -R oug+w $projectBase/.esm-cache/vd $projectBase/.esm-cache/esm
#ls -la $projectBase/.esm-cache
#$dockerCompose down || true
#$dockerCompose up -d
packageDir=${projectBase=}/dist/fireproof-core

#user="admin$(date +%s)"
#curl --retry 10 --retry-max-time 30 --retry-all-errors http://localhost:4873/
#curl \
#     -X PUT \
#     -H "Content-type: application/json" \
#     -d "{ \"name\": \"$user\", \"password\": \"admin\" }" \
#     'http://localhost:4873/-/user/org.couchdb.user:$user'
#
#user="admin$(date +%s)"
#token=$(curl \
#     -X PUT \
#     -H "Content-type: application/json" \
#     -d "{ \"name\": \"$user\", \"password\": \"admin\" }" \
#     'http://localhost:4873/-/user/org.couchdb.user:$user' | jq .token)
#
#echo "Token: $user:$token"
#cat <<EOF > $packageDir/.npmrc
#; .npmrc
#enable-pre-post-scripts=true
#//localhost:4873/:_authToken=$token
#@fireproof:registry=http://localhost:4873
#EOF

#(cd $packageDir &&
#	(npm unpublish --force || true) &&
#         npm publish --no-git-checks)

tmpDir=$(mktemp -d)
cp $projectBase/dist/npmrc-smoke .npmrc
unset npm_config_registry
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir
cp package-template.json package.json
cat > setup.js <<EOF
function gthis() {
  return globalThis;
}

function getVersion() {
  let version = "refs/tags/v$(cat $projectBase/dist/fp-version)";
  if ("$GITHUB_REF" && "$GITHUB_REF".startsWith("refs/tags/v")) {
    version = "GITHUB_REF";
  }
  return version.split("/").slice(-1)[0].replace(/^v/, "");
}

gthis()["FP_VERSION"]=getVersion()
EOF

pnpm install
pnpm run test
rm -rf $tmpDir
cd $smokeDir
#$dockerCompose down
