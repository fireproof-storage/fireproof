#!/bin/bash
#echo "run.sh $@,$1,$FP_TSC"
if [ "$1" = "tsc" ]
then
  if [ -z "$FP_TSC" ]
  then
    FP_TSC=tsgo
  fi
  exec pnpm exec $FP_TSC $@
fi

exec pnpm exec tsx $(dirname $0)/main.ts $@
