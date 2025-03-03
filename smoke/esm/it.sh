#!/usr/bin/env bash
set -e
projectBase=$(pwd)
cd smoke/esm
smokeDir=$(pwd)

packageDir=${projectBase}/dist/fireproof-core

# Check if FP_VERSION is available
FP_VERSION=$(cat $projectBase/dist/fp-version)
if [ -z "$FP_VERSION" ]; then
  echo "❌ ERROR: FP_VERSION not found in $projectBase/dist/fp-version"
  exit 1
fi

tmpDir=$(mktemp -d)

cp $projectBase/dist/npmrc-smoke $tmpDir/.npmrc
if [ ! -f "$tmpDir/.npmrc" ]; then
  echo "❌ ERROR: Failed to copy .npmrc file"
  exit 1
fi

unset npm_config_registry
rm -rf node_modules dist pnpm-lock.yaml
rsync -vaxH . $tmpDir/
cd $tmpDir

mv package-template.json package.json

cat > "$tmpDir/setup.js" << EOL
// This file is loaded by Vitest before tests run
// It sets up global variables needed by the tests

// Make sure we're setting variables on the correct global object
function gthis() {
  return globalThis || window || self || global;
}

function getVersion() {
  let version = "refs/tags/v$(cat $projectBase/dist/fp-version)";
  if ("$GITHUB_REF" && "$GITHUB_REF".startsWith("refs/tags/v")) {
    version = "GITHUB_REF";
  }
  return version.split("/").slice(-1)[0].replace(/^v/, "");
}

// Set environment variables on the global object
gthis()["FP_STACK"]="$FP_STACK"
gthis()["FP_DEBUG"]="$FP_DEBUG"
gthis()["FP_VERSION"]="$FP_VERSION"

EOL

pnpm add -D vitest --allow-build edgedriver --allow-build esbuild --allow-build geckodriver --allow-build msw

if [ $? -ne 0 ]; then
  echo "❌ ERROR: Failed to install dependencies"
  if [ "$FP_CI" = "fp_ci" ]; then
    echo "Running in CI environment - failing fast"
    exit 1
  fi
fi

FP_VERSION="$FP_VERSION" FP_DEBUG="$FP_DEBUG" FP_STACK="$FP_STACK" pnpm run test
TEST_RESULT=$?

rm -rf $tmpDir
cd $smokeDir

if [ $TEST_RESULT -ne 0 ]; then
  echo "❌ Tests failed with exit code $TEST_RESULT"
  exit $TEST_RESULT
fi
