
GIT=$(git rev-parse HEAD)
rm -rf ./dist/fireproof-docs
git clone $(pwd)/.git -b docs ./dist/fireproof-docs
(cd ./dist/fireproof-docs && git rm -rf docs)
mkdir -p dist/fireproof-docs/docs
npx typedoc --out dist/fireproof-docs/docs  src/database.ts
(cd ./dist/fireproof-docs && git add `find docs -print` && git status && git commit -am "build from ${GIT}" && git push)

