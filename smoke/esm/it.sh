#!/bin/sh
set -e
projectBase=$(pwd)
cd smoke/esm
smokeDir=$(pwd)

# Print debug information to stdout
echo "=== ESM TEST DEBUG INFO ==="
echo "Running in directory: $(pwd)"
echo "Project base: $projectBase"
echo "Environment variables:"
env | grep -E 'FP_|GITHUB_|CI|NODE'

#if which docker-compose
#then
#  dockerCompose="docker-compose"
#else
#  dockerCompose="docker compose"
#fi

#cat > .env <<EOF
#PROJECT_BASE=$projectBase
#EOF
# mkdir -p $projectBase/.esm-cache/vd $projectBase/.esm-cache/esm
# chmod -R oug+w $projectBase/.esm-cache/vd $projectBase/.esm-cache/esm
# echo "ESM cache contents:"
# ls -la $projectBase/.esm-cache
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
echo "Temporary directory: $tmpDir"
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

// Set global variables
gthis()["FP_STACK"]="stack"
gthis()["FP_DEBUG"]="*"
gthis()["FP_VERSION"]=getVersion()

// Log setup completion
console.log("Setup.js executed, globals set:", {
  FP_STACK: gthis()["FP_STACK"],
  FP_DEBUG: gthis()["FP_DEBUG"],
  FP_VERSION: gthis()["FP_VERSION"]
});
EOF

echo "Installing dependencies..."
pnpm install
echo "Running tests..."
pnpm run test
echo "Test run complete"
rm -rf $tmpDir
cd $smokeDir
#$dockerCompose down
