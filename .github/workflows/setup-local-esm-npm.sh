#!/bin/sh -e
set -ex

# progName=$0
projectRoot=$(pwd)
# cd $(dirname $progName)

if [ "$(which podman)" ] && [ "$FP_CI" != "fp_ci" ]
then
  dockerCompose="podman compose"
else
  docker compose version
  if [ $? -eq 0 ]
  then
    dockerCompose="docker compose"
  else
    dockerCompose="docker-compose"
  fi
fi

mkdir -p $HOME/.cache/vd $HOME/.cache/esm
id
if [ "$FP_CI" = "fp_ci" ]
then
  sudo chmod -R oug+w $HOME/.cache/vd $HOME/.cache/esm
else
  chmod -R oug+w $HOME/.cache/vd $HOME/.cache/esm
fi

export PROJECT_BASE=$projectRoot
# $dockerCompose down || exit 0
$dockerCompose -f .github/docker-compose.yaml up -d --wait --force-recreate

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
