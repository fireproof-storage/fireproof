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

gthis()["FP_STACK"]="stack"
gthis()["FP_DEBUG"]="*"
gthis()["FP_VERSION"]=getVersion()
EOF

# Add diagnostic function
check_registry_status() {
  echo "Checking registry status..."
  local registry_status=$(curl --retry 3 --retry-max-time 10 --retry-all-errors -s -o /dev/null -w "%{http_code}" http://localhost:4873/)
  if [ "$registry_status" != "200" ]; then
    echo "❌ ERROR: Registry not responding properly (HTTP $registry_status)"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
  else
    echo "✅ Registry is responding (HTTP $registry_status)"
  fi
  
  echo "Checking ESM server status..."
  local esm_status=$(curl --retry 3 --retry-max-time 10 --retry-all-errors -s -o /dev/null -w "%{http_code}" http://localhost:4874/)
  if [ "$esm_status" != "200" ]; then
    echo "❌ ERROR: ESM server not responding properly (HTTP $esm_status)"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
  else
    echo "✅ ESM server is responding (HTTP $esm_status)"
  fi
  
  if [ -f ".npmrc" ]; then
    echo "Checking .npmrc file:"
    cat .npmrc
  else
    echo "❌ ERROR: .npmrc file not found"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
  fi
  
  echo "Checking for published packages:"
  local package_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4873/@fireproof/core)
  if [ "$package_status" = "404" ]; then
    echo "❌ ERROR: Package not found in registry (HTTP $package_status)"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
  else
    echo "✅ Package is available in registry (HTTP $package_status)"
  fi
}

# Copy npmrc-smoke before verifying services
cp $projectBase/dist/npmrc-smoke .npmrc || {
  echo "❌ ERROR: Failed to copy npmrc-smoke file"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
}

# Verify services before starting tests
echo "Verifying services before running tests..."
check_registry_status

pnpm install || { echo "Failed to install dependencies"; check_registry_status; exit 1; }
pnpm run test || { echo "Tests failed"; check_registry_status; exit 1; }
rm -rf $tmpDir
cd $smokeDir
#$dockerCompose down
