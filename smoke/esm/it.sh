#!/bin/sh
set -e
projectBase=$(pwd)
cd smoke/esm
smokeDir=$(pwd)

check_registry_health() {
  local registry_status=$(curl --retry 3 --retry-max-time 10 --retry-all-errors -s -o /dev/null -w "%{http_code}" http://localhost:4873/)
  if [ "$registry_status" != "200" ]; then
    echo " ERROR: Registry not responding properly (HTTP $registry_status)"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
    return 1
  fi
  echo " Registry is responding properly (HTTP $registry_status)"
  return 0
}

check_esm_server_health() {
  local esm_status=$(curl --retry 3 --retry-max-time 10 --retry-all-errors -s -o /dev/null -w "%{http_code}" http://localhost:4874/)
  if [ "$esm_status" != "200" ]; then
    echo " ERROR: ESM server not responding properly (HTTP $esm_status)"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
    return 1
  fi
  echo " ESM server is responding properly (HTTP $esm_status)"
  return 0
}

verify_esm_module() {
  local version=$1
  local max_retries=5
  local retry_count=0
  local wait_time=2
  
  echo "Verifying ESM module @fireproof/core@$version is available..."
  
  while [ $retry_count -lt $max_retries ]; do
    ESM_MODULE_URL="http://localhost:4874/@fireproof/core@$version?no-dts"
    ESM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ESM_MODULE_URL")
    
    if [ "$ESM_STATUS" = "200" ]; then
      echo " ESM module is available at $ESM_MODULE_URL (HTTP Status: $ESM_STATUS)"
      return 0
    else
      echo " ESM module not available yet: $ESM_MODULE_URL (HTTP Status: $ESM_STATUS)"
      
      # Try with the smoke tag
      ESM_MODULE_URL_TAG="http://localhost:4874/@fireproof/core@$version?tag=smoke&no-dts"
      ESM_STATUS_TAG=$(curl -s -o /dev/null -w "%{http_code}" "$ESM_MODULE_URL_TAG")
      
      if [ "$ESM_STATUS_TAG" = "200" ]; then
        echo " ESM module is available with tag at $ESM_MODULE_URL_TAG (HTTP Status: $ESM_STATUS_TAG)"
        # Update the setup.js file to use the tagged URL
        echo "export const ESM_MODULE_URL = '$ESM_MODULE_URL_TAG';" > esm_module_url.js
        return 0
      fi
    fi
    
    retry_count=$((retry_count + 1))
    if [ $retry_count -lt $max_retries ]; then
      wait_time=$((wait_time * 2))
      echo "Retrying in $wait_time seconds... (Attempt $retry_count/$max_retries)"
      sleep $wait_time
    fi
  done
  
  echo " Failed to verify ESM module @fireproof/core@$version after $max_retries attempts"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
  return 1
}

echo "Verifying services before running tests..."
check_registry_health
check_esm_server_health

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
packageDir=${projectBase}/dist/fireproof-core

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

FP_VERSION=$(cat $projectBase/dist/fp-version)
verify_esm_module "$FP_VERSION"

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

pnpm install
pnpm run test
rm -rf $tmpDir
cd $smokeDir
#$dockerCompose down
