#!/bin/sh -e
set -e


projectRoot=$(pwd)

if [ "$FP_CI" != 'fp_ci' ]
then
  bash .github/workflows/setup-local-esm-npm.sh
fi

unset npm_config_registry

FP_VERSION=$(node $projectRoot/smoke/get-fp-version.js)
echo $FP_VERSION > $projectRoot/dist/fp-version

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
     pnpm publish --registry=http://localhost:4873 --no-git-checks)
done

curl -L "http://localhost:4874/@fireproof/core@$(cat $projectRoot/dist/fp-version)" > /dev/null &

