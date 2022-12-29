while read p; do
  pail put $p $(node randomcid.mjs) --max-shard-size=10000
done </usr/share/dict/propernames
