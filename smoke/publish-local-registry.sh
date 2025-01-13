#!/bin/sh -e
set -e

progName=$0
projectRoot=$(pwd)
cd $(dirname $progName)

if which docker-compose
then
  dockerCompose="docker-compose"
else
  dockerCompose="docker compose"
fi

mkdir -p $projectRoot/.esm-cache/vd $projectRoot/.esm-cache/esm
chmod -R oug+w $projectRoot/.esm-cache/vd $projectRoot/.esm-cache/esm
ls -la $projectRoot/.esm-cache


export PROJECT_BASE=$projectRoot
$dockerCompose down || exit 0
$dockerCompose up -d --wait

docker logs -f smoke-esm-sh-1 &
curl -L http://localhost:4874/@fireproof/core &
#sleep 5

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
#env | grep -v npm_
for packageDir in $projectRoot/dist/use-fireproof $projectRoot/dist/fireproof-core 
do
	cp $projectRoot/dist/npmrc-smoke $packageDir/.npmrc
	(cd $packageDir && 
         cat .npmrc && 
	 (npm unpublish --force || true) &&
         pnpm publish --registry=http://localhost:4873 --no-git-checks)
done


