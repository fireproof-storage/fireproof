#!/bin/sh
set -e
projectBase=$(pwd)
export projectBase
cd smoke/esm
smokeDir=$(pwd)

packageDir=${projectBase=}/dist/fireproof-core

tmpDir=$(mktemp -d)
cp $projectBase/dist/npmrc-smoke .npmrc
unset npm_config_registry
rm -rf node_modules dist pnpm-lock.yaml
rsync -vaxH . $tmpDir/
cd $tmpDir
cp package-template.json package.json
cat > setup.js <<EOF
function gthis() {
  return globalThis;
}

function getVersion() {
  let version = "refs/tags/v$(cat $projectBase/dist/fp-version.txt)";
  if ("$GITHUB_REF" && "$GITHUB_REF".startsWith("refs/tags/v")) {
    version = "$GITHUB_REF";
  }
  return version.split("/").slice(-1)[0].replace(/^v/, "");
}

gthis()["FP_STACK"]="stack"
gthis()["FP_DEBUG"]="*"
gthis()["FP_VERSION"]=getVersion()
gthis()["FP_ESM"]="$FP_ESM" ? "$FP_ESM" : "http://localhost:4874"
EOF

pnpm install --prefer-offline --package-import-method=hardlink
pnpm exec playwright install chromium
pnpm run test
pnpm exec deno run --allow-read --allow-write --allow-env --allow-import deno-test.ts


if [ -z "$NO_CLEANUP" ]
then
  rm -rf $tmpDir
else
  echo $tmpDir
fi
#rm -rf $tmpDir
#cd $smokeDir
#$dockerCompose down

