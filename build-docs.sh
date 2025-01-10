
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
npx typedoc --out dist/fireproof-docs/docs  src/ledger.ts

cd ./dist/fireproof-docs
git add docs
if [ -z $GITHUB_REF ]
then
  git status --porcelain
  if [ $? = 0 ]
  then
    git commit -am "build from ${GIT} [skip ci]"
    git push origin docs
  fi
else
  git status
fi

