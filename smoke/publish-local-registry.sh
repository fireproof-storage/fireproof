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

# Verify that the package is available via HTTP before proceeding
echo "Verifying package availability..."
MAX_RETRIES=10
RETRY_COUNT=0
PACKAGE_URL="http://localhost:4874/@fireproof/core@$(cat $projectRoot/dist/fp-version)"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $PACKAGE_URL)
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "Package is available at $PACKAGE_URL"
    break
  else
    echo "Package not yet available (status: $HTTP_STATUS), retrying in 2 seconds..."
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
  fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "Warning: Package may not be available after $MAX_RETRIES retries"
fi

curl -L "$PACKAGE_URL" > /dev/null &
