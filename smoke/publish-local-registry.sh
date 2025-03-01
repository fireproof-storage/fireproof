#!/bin/sh -e
set -e

progName=$0
projectRoot=$(pwd)
cd $(dirname $progName)

if [ "$(which podman)" ] && [ "$FP_CI" != "fp_ci" ]
then
  dockerCompose="podman compose"
elif which docker-compose
then
  dockerCompose="docker-compose"
else
  dockerCompose="docker compose"
fi

mkdir -p $projectRoot/.esm-cache/vd $projectRoot/.esm-cache/esm
chmod -R oug+w $projectRoot/.esm-cache/vd $projectRoot/.esm-cache/esm
ls -la $projectRoot/.esm-cache


export PROJECT_BASE=$projectRoot
# $dockerCompose down || exit 0
$dockerCompose up -d --wait

mkdir -p $projectRoot/dist

user="admin$(date +%s)"
token=$(curl \
     --retry 10 --retry-max-time 30 --retry-all-errors \
     -X PUT \
     -H "Content-type: application/json" \
     -d "{ \"name\": \"$user\", \"password\": \"admin\" }" \
     'http://localhost:4873/-/user/org.couchdb.user:$user' | jq .token)

echo "Token: $user:$token"
cat <<EOF > $projectRoot/dist/npmrc-smoke
; .npmrc
enable-pre-post-scripts=true
//localhost:4873/:_authToken=$token
@fireproof:registry=http://localhost:4873/
registry=http://localhost:4873/
EOF

unset npm_config_registry

FP_VERSION=$(node $projectRoot/smoke/get-fp-version.js)
echo $FP_VERSION > $projectRoot/dist/fp-version


#env | grep -v npm_
for packageDir in $projectRoot/dist/use-fireproof $projectRoot/dist/fireproof-core
do
  smokeDir=$projectRoot/dist/smoke/$(basename $packageDir)
  rm -rf $smokeDir
  mkdir -p $smokeDir
  rsync -axH $packageDir/ $smokeDir/
  cp $projectRoot/dist/npmrc-smoke $smokeDir/.npmrc
  (cd $smokeDir &&
     pnpm version $(cat $projectRoot/dist/fp-version) --no-git-tag-version &&
     if [ -f "package.json" ]; then
       node $projectRoot/smoke/patch-fp-version.js package.json $(cat $projectRoot/dist/fp-version)
     else
       echo "Warning: package.json not found in $smokeDir, skipping version patch"
     fi &&
     cat .npmrc &&
     cat package.json &&
     pnpm publish --registry=http://localhost:4873 --no-git-checks --tag smoke &&
     npm dist-tag add $(node -e "console.log(require('./package.json').name)")@$(cat $projectRoot/dist/fp-version) latest --registry=http://localhost:4873)
done

# Wait for registry to be fully ready
echo "Waiting for registry to be fully ready..."
MAX_REGISTRY_RETRIES=15
REGISTRY_RETRY_COUNT=0

while [ $REGISTRY_RETRY_COUNT -lt $MAX_REGISTRY_RETRIES ]; do
  REGISTRY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4873/)
  if [ "$REGISTRY_STATUS" = "200" ]; then
    echo "✅ Registry is ready (HTTP Status: $REGISTRY_STATUS)"
    break
  else
    echo "⚠️ Registry not yet ready (HTTP status: $REGISTRY_STATUS), retrying in 2 seconds..."
    sleep 2
    REGISTRY_RETRY_COUNT=$((REGISTRY_RETRY_COUNT + 1))
  fi
done

if [ $REGISTRY_RETRY_COUNT -eq $MAX_REGISTRY_RETRIES ]; then
  echo "⚠️ Warning: Registry may not be ready after $MAX_REGISTRY_RETRIES retries"
  echo "Continuing anyway, but this might cause issues..."
fi

# Wait for ESM server to be fully ready
echo "Waiting for ESM server to be fully ready..."
MAX_ESM_RETRIES=15
ESM_RETRY_COUNT=0

while [ $ESM_RETRY_COUNT -lt $MAX_ESM_RETRIES ]; do
  ESM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4874/)
  if [ "$ESM_STATUS" = "200" ]; then
    echo "✅ ESM server is ready (HTTP Status: $ESM_STATUS)"
    break
  else
    echo "⚠️ ESM server not yet ready (HTTP status: $ESM_STATUS), retrying in 2 seconds..."
    sleep 2
    ESM_RETRY_COUNT=$((ESM_RETRY_COUNT + 1))
  fi
done

if [ $ESM_RETRY_COUNT -eq $MAX_ESM_RETRIES ]; then
  echo "⚠️ Warning: ESM server may not be ready after $MAX_ESM_RETRIES retries"
  echo "Continuing anyway, but this might cause issues..."
fi

# Verify that the package is available via HTTP before proceeding
echo "Verifying package availability..."
MAX_RETRIES=10
RETRY_COUNT=0
PACKAGE_URL="http://localhost:4874/@fireproof/core@$(cat $projectRoot/dist/fp-version)"
PACKAGE_VERSION="$(cat $projectRoot/dist/fp-version)"

echo "Package version: $PACKAGE_VERSION"
echo "Package URL: $PACKAGE_URL"

# First check registry metadata to see what versions are available
echo "Checking registry metadata..."
REGISTRY_META=$(curl -s http://localhost:4873/@fireproof/core)
echo "Available versions in registry:"
echo "$REGISTRY_META" | grep -o '"versions":{[^}]*}' | tr ',' '\n' | grep -v '"versions"'

# Check if our version is in the registry
if echo "$REGISTRY_META" | grep -q "\"$PACKAGE_VERSION\""; then
  echo "✅ Version $PACKAGE_VERSION found in registry metadata"
else
  echo "⚠️ Version $PACKAGE_VERSION NOT found in registry metadata"
fi

# Check registry tags
echo "Checking registry tags..."
REGISTRY_TAGS=$(curl -s http://localhost:4873/-/package/@fireproof/core/dist-tags)
echo "Available tags in registry: $REGISTRY_TAGS"

# Now check HTTP availability
echo "Checking HTTP availability..."
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $PACKAGE_URL)
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Package is available at $PACKAGE_URL (HTTP Status: $HTTP_STATUS)"
    
    # Additional verification - check that we can actually get the content
    CONTENT_SIZE=$(curl -s "$PACKAGE_URL" | wc -c)
    echo "Package content size: $CONTENT_SIZE bytes"
    
    if [ $CONTENT_SIZE -gt 100 ]; then
      echo "✅ Package content verified (size: $CONTENT_SIZE bytes)"
      break
    else
      echo "⚠️ Package content too small ($CONTENT_SIZE bytes), may be an error response"
      sleep 2
      RETRY_COUNT=$((RETRY_COUNT + 1))
    fi
  else
    echo "⚠️ Package not yet available (HTTP status: $HTTP_STATUS), retrying in 2 seconds..."
    
    # Check if the ESM server is responding at all
    ESM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4874/)
    echo "ESM server status: $ESM_STATUS"
    
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
  fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "⚠️ Warning: Package may not be available after $MAX_RETRIES retries"
  echo "Diagnostic information:"
  echo "- Registry URL: http://localhost:4873/"
  echo "- ESM Server URL: http://localhost:4874/"
  echo "- Package URL: $PACKAGE_URL"
  echo "- Latest HTTP Status: $HTTP_STATUS"
  
  # Try to get directory listing from ESM server
  echo "ESM server directory listing:"
  curl -s http://localhost:4874/@fireproof/ | head -n 20
fi

# Prefetch the package to warm up the cache
echo "Prefetching package to warm cache..."
curl -L "$PACKAGE_URL" > /dev/null &
