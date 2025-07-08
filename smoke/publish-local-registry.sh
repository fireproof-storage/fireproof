#!/bin/sh -e
set -ex

projectRoot=$(pwd)

if [ "$FP_CI" != 'fp_ci' ]
then
  bash .github/workflows/setup-local-esm-npm.sh
fi

#unset npm_config_registry

rm -f $projectRoot/dist/fp-version.txt

pnpm run publish --registry http://localhost:4874

# curl -L "http://localhost:4874/@fireproof/core@$(cat $projectRoot/dist/fp-version.txt)" > /dev/null &

