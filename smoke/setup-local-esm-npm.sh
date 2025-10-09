#!/bin/sh -e
set -ex

# progName=$0
projectRoot=$(pwd)
# cd $(dirname $progName)

if [ "$(which podman)" ] && [ "$FP_CI" != "fp_ci" ]; then
	dockerCompose="podman compose"
else
	docker compose version
	if [ $? -eq 0 ]; then
		dockerCompose="docker compose"
	else
		dockerCompose="docker-compose"
	fi
fi

mkdir -p $HOME/.cache/vd $HOME/.cache/esm
id
if [ "$FP_CI" = "fp_ci" ]; then
	echo "is now outside the runtime"
	# sudo chmod -R oug+w $HOME/.cache/vd $HOME/.cache/esm
else
	chmod -R oug+w $HOME/.cache/vd $HOME/.cache/esm
fi

export PROJECT_BASE=$projectRoot
# $dockerCompose down || exit 0
$dockerCompose -f .github/docker-compose.yaml up -d --wait --force-recreate

mkdir -p $projectRoot/dist

if [ -z "$FP_NPM_REGISTRY" ]; then
	FP_NPM_REGISTRY="http://localhost:4873"
fi

user="admin$(date +%s)"
token=$(curl \
	--retry 10 --retry-max-time 30 --retry-all-errors \
	-X PUT \
	-H "Content-type: application/json" \
	-d "{ \"name\": \"$user\", \"password\": \"admin\" }" \
	"$FP_NPM_REGISTRY/-/user/org.couchdb.user:\$user" | jq .token)

echo "Token: $user:$token"
cat <<EOF >$projectRoot/dist/npmrc-smoke
; .npmrc
enable-pre-post-scripts=true
registry=$FP_NPM_REGISTRY
@fireproof:registry=$FP_NPM_REGISTRY
$FP_NPM_REGISTRY:_authToken=$token
EOF
