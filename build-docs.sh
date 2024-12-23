
GIT=$(git rev-parse HEAD)
rm -rf ./dist/fireproof-docs
git clone $(pwd)/.git -b docs ./dist/fireproof-docs
cp .git/config ./dist/fireproof-docs/.git/
(
  cd ./dist/fireproof-docs &&
  git config advice.addIgnoredFile false &&
  git pull origin docs &&
  git rm -rf docs
)
mkdir -p dist/fireproof-docs/docs
npx typedoc --out dist/fireproof-docs/docs  src/database.ts

cd ./dist/fireproof-docs
git add docs
if $(git status --porcelain)
then
  git commit -am "build from ${GIT} [skip ci]"
  git push origin docs
fi

