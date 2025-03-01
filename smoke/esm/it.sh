#!/bin/sh
set -e
projectBase=$(pwd)
cd smoke/esm
smokeDir=$(pwd)

check_registry_health() {
  local registry_status=$(curl --retry 3 --retry-max-time 10 --retry-all-errors -s -o /dev/null -w "%{http_code}" http://localhost:4873/)
  if [ "$registry_status" != "200" ]; then
    echo " ERROR: Registry not responding properly (HTTP $registry_status)"
    # Try to get more diagnostic information
    echo " Registry diagnostic information:"
    curl -v http://localhost:4873/ || echo "Failed to get verbose output from registry"
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
    # Try to get more diagnostic information
    echo " ESM server diagnostic information:"
    curl -v http://localhost:4874/ || echo "Failed to get verbose output from ESM server"
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
  
  if [ -z "$version" ]; then
    echo " ERROR: No version provided for ESM module verification"
    if [ "$FP_CI" = "fp_ci" ]; then
      echo "Running in CI environment - failing fast"
      exit 1
    fi
    return 1
  fi
  
  while [ $retry_count -lt $max_retries ]; do
    ESM_MODULE_URL="http://localhost:4874/@fireproof/core@$version?no-dts"
    echo "Checking URL: $ESM_MODULE_URL"
    ESM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ESM_MODULE_URL")
    
    if [ "$ESM_STATUS" = "200" ]; then
      echo " ESM module is available at $ESM_MODULE_URL (HTTP Status: $ESM_STATUS)"
      
      # Verify content length
      CONTENT_LENGTH=$(curl -sI "$ESM_MODULE_URL" | grep -i "Content-Length" | awk '{print $2}' | tr -d '\r\n')
      echo " Module content length: $CONTENT_LENGTH bytes"
      
      if [ -z "$CONTENT_LENGTH" ] || [ "$CONTENT_LENGTH" -lt 1000 ]; then
        echo " WARNING: Module content length is suspiciously small: $CONTENT_LENGTH bytes"
        # Get a sample of the content
        echo " Content sample:"
        curl -s "$ESM_MODULE_URL" | head -c 200
        echo
      fi
      
      # Update the setup.js file to use this URL
      echo "export const ESM_MODULE_URL = '$ESM_MODULE_URL';" > esm_module_url.js
      return 0
    else
      echo " Module not available yet: $ESM_MODULE_URL (HTTP Status: $ESM_STATUS)"
      
      # Try with the smoke tag
      ESM_MODULE_URL_TAG="http://localhost:4874/@fireproof/core@$version?tag=smoke&no-dts"
      echo "Checking URL with tag: $ESM_MODULE_URL_TAG"
      ESM_STATUS_TAG=$(curl -s -o /dev/null -w "%{http_code}" "$ESM_MODULE_URL_TAG")
      
      if [ "$ESM_STATUS_TAG" = "200" ]; then
        echo " ESM module is available with tag at $ESM_MODULE_URL_TAG (HTTP Status: $ESM_STATUS_TAG)"
        
        # Verify content length
        CONTENT_LENGTH=$(curl -sI "$ESM_MODULE_URL_TAG" | grep -i "Content-Length" | awk '{print $2}' | tr -d '\r\n')
        echo " Module content length: $CONTENT_LENGTH bytes"
        
        if [ -z "$CONTENT_LENGTH" ] || [ "$CONTENT_LENGTH" -lt 1000 ]; then
          echo " WARNING: Module content length is suspiciously small: $CONTENT_LENGTH bytes"
          # Get a sample of the content
          echo " Content sample:"
          curl -s "$ESM_MODULE_URL_TAG" | head -c 200
          echo
        fi
        
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
  
  # Collect diagnostic information
  echo " Diagnostic information for troubleshooting:"
  echo "1. Registry package information:"
  curl -s "http://localhost:4873/@fireproof%2Fcore" || echo "Failed to get package info"
  echo
  
  echo "2. ESM server status:"
  curl -v "http://localhost:4874/" || echo "Failed to get ESM server status"
  echo
  
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
  return 1
}

echo "🚀 Starting ESM smoke test..."
echo "🔍 Verifying services before running tests..."

# Check if .npmrc file exists and has correct content
if [ ! -f "$projectBase/dist/npmrc-smoke" ]; then
  echo "❌ ERROR: .npmrc file not found at $projectBase/dist/npmrc-smoke"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
else
  echo "✅ .npmrc file found at $projectBase/dist/npmrc-smoke"
  echo "📊 .npmrc content:"
  cat "$projectBase/dist/npmrc-smoke"
fi

check_registry_health
check_esm_server_health

packageDir=${projectBase}/dist/fireproof-core

# Check if FP_VERSION is available
FP_VERSION=$(cat $projectBase/dist/fp-version)
if [ -z "$FP_VERSION" ]; then
  echo "❌ ERROR: FP_VERSION not found in $projectBase/dist/fp-version"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
else
  echo "✅ Using FP_VERSION: $FP_VERSION"
fi

verify_esm_module "$FP_VERSION"

echo "🔍 Creating temporary directory for test..."
tmpDir=$(mktemp -d)
echo "✅ Created temporary directory: $tmpDir"

echo "🔍 Copying .npmrc file..."
cp $projectBase/dist/npmrc-smoke .npmrc
if [ ! -f ".npmrc" ]; then
  echo "❌ ERROR: Failed to copy .npmrc file"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
else
  echo "✅ .npmrc file copied successfully"
fi

echo "🔍 Preparing test environment..."
unset npm_config_registry
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir

echo "🔍 Creating package.json from template..."
cp package-template.json package.json
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: Failed to create package.json"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
else
  echo "✅ package.json created successfully"
  echo "📊 package.json content:"
  cat package.json
fi

echo "🔍 Creating setup.js..."
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

console.log("🔍 Setup.js initialized with FP_VERSION =", gthis()["FP_VERSION"]);
EOF

echo "✅ setup.js created successfully"
echo "📊 setup.js content:"
cat setup.js

echo "🔍 Installing dependencies..."
pnpm install
if [ $? -ne 0 ]; then
  echo "❌ ERROR: Failed to install dependencies"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
else
  echo "✅ Dependencies installed successfully"
fi

echo "🚀 Running tests..."
pnpm run test
TEST_RESULT=$?

echo "🔍 Cleaning up temporary directory..."
rm -rf $tmpDir
cd $smokeDir

if [ $TEST_RESULT -ne 0 ]; then
  echo "❌ Tests failed with exit code $TEST_RESULT"
  exit $TEST_RESULT
else
  echo "✅ Tests completed successfully"
fi
