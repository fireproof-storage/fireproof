#!/bin/sh -e
set -ex

projectRoot=$(pwd)

if [ "$FP_CI" != 'fp_ci' ]
then
  bash $projectRoot/smoke/setup-local-esm-npm.sh
fi

#unset npm_config_registry

rm -f $projectRoot/dist/fp-version.txt

exec pnpm run publish --registry http://localhost:4873
