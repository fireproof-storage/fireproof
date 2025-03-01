#!/bin/sh -e
set -e

# Function to verify package is published and available
verify_package_published() {
  local package_name=$1
  local version=$2
  local max_retries=3
  local retry_count=0
  local wait_time=2
  
  echo "Verifying package $package_name@$version is published..."
  
  while [ $retry_count -lt $max_retries ]; do
    # Check if package is available in the registry
    # For scoped packages like @fireproof/core, the URL is http://localhost:4873/@fireproof%2Fcore
    if [[ $package_name =~ ^@ ]]; then
      # Replace @ with %40 and / with %2F for URL encoding
      encoded_name=$(echo "$package_name" | sed 's/@/%40/g; s/\//%2F/g')
      PACKAGE_URL="http://localhost:4873/$encoded_name"
    else
      PACKAGE_URL="http://localhost:4873/$package_name"
    fi
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PACKAGE_URL")
    
    if [ "$HTTP_STATUS" = "200" ]; then
      echo "✅ Package is available at $PACKAGE_URL (HTTP Status: $HTTP_STATUS)"
      
      # Check if we can get the package metadata with the specific version
      METADATA=$(curl -s "$PACKAGE_URL")
      if echo "$METADATA" | grep -q "$version"; then
        echo "✅ Package version $version found in metadata"
        return 0
      else
        echo "⚠️ Package version $version not found in metadata"
      fi
    else
      echo "⚠️ Package not available yet: $PACKAGE_URL (HTTP Status: $HTTP_STATUS)"
    fi
    
    retry_count=$((retry_count + 1))
    if [ $retry_count -lt $max_retries ]; then
      wait_time=$((wait_time * 2))
      echo "Retrying in $wait_time seconds... (Attempt $retry_count/$max_retries)"
      sleep $wait_time
    fi
  done
  
  echo "❌ Failed to verify package $package_name@$version after $max_retries attempts"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
  return 1
}

# Check if registry is responding
check_registry_health() {
  local registry_status=$(curl --retry 3 --retry-max-time 10 --retry-all-errors -s -o /dev/null -w "%{http_code}" http://localhost:4873/)
  if [ "$registry_status" != "200" ]; then
    echo "❌ ERROR: Registry not responding properly (HTTP $registry_status)"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
    return 1
  fi
  echo "✅ Registry is responding properly (HTTP $registry_status)"
  return 0
}

# Check if ESM server is responding
check_esm_server_health() {
  local esm_status=$(curl --retry 3 --retry-max-time 10 --retry-all-errors -s -o /dev/null -w "%{http_code}" http://localhost:4874/)
  if [ "$esm_status" != "200" ]; then
    echo "❌ ERROR: ESM server not responding properly (HTTP $esm_status)"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
    return 1
  fi
  echo "✅ ESM server is responding properly (HTTP $esm_status)"
  return 0
}

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

# Verify registry and ESM server are up and running
check_registry_health
check_esm_server_health

mkdir -p $projectRoot/dist

user="admin$(date +%s)"
token=$(curl \
     --retry 10 --retry-max-time 30 --retry-all-errors \
     -X PUT \
     -H "Content-type: application/json" \
     -d "{ \"name\": \"$user\", \"password\": \"admin\" }" \
     'http://localhost:4873/-/user/org.couchdb.user:$user' | jq .token)

if [ -z "$token" ] || [ "$token" = "null" ]; then
  echo "❌ Failed to generate token for user $user"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
else
  echo "✅ Token generated successfully for user $user"
fi

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
     node $projectRoot/smoke/patch-fp-version.js package.json $(cat $projectRoot/dist/fp-version)
     cat .npmrc &&
     cat package.json &&
     pnpm publish --registry=http://localhost:4873 --no-git-checks --tag smoke
     # Get the correct package name from package.json
     package_name=$(node -e "console.log(require('./package.json').name)")
     verify_package_published "$package_name" "$FP_VERSION")
done

# Verify ESM module is available
ESM_MODULE_URL="http://localhost:4874/@fireproof/core@$FP_VERSION?no-dts"
echo "Verifying ESM module is available at: $ESM_MODULE_URL"

max_retries=5
retry_count=0
wait_time=2

while [ $retry_count -lt $max_retries ]; do
  ESM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ESM_MODULE_URL")
  
  if [ "$ESM_STATUS" = "200" ]; then
    echo "✅ ESM module is available at $ESM_MODULE_URL (HTTP Status: $ESM_STATUS)"
    break
  else
    echo "⚠️ ESM module not available yet: $ESM_MODULE_URL (HTTP Status: $ESM_STATUS)"
    
    # Try with the smoke tag
    ESM_MODULE_URL_TAG="http://localhost:4874/@fireproof/core@$FP_VERSION?tag=smoke&no-dts"
    ESM_STATUS_TAG=$(curl -s -o /dev/null -w "%{http_code}" "$ESM_MODULE_URL_TAG")
    
    if [ "$ESM_STATUS_TAG" = "200" ]; then
      echo "✅ ESM module is available with tag at $ESM_MODULE_URL_TAG (HTTP Status: $ESM_STATUS_TAG)"
      ESM_MODULE_URL="$ESM_MODULE_URL_TAG"
      break
    fi
  fi
  
  retry_count=$((retry_count + 1))
  if [ $retry_count -lt $max_retries ]; then
    wait_time=$((wait_time * 2))
    echo "Retrying in $wait_time seconds... (Attempt $retry_count/$max_retries)"
    sleep $wait_time
  fi
done

if [ $retry_count -ge $max_retries ]; then
  echo "❌ ERROR: ESM module not available after $max_retries attempts"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
fi

curl -L "$ESM_MODULE_URL" > /dev/null &
