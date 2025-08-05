#!/bin/bash
#echo "run.sh $0,$1,$FP_TSC $PATH"
if [ "$1" = "tsc" ]
then
  if [ -z "$FP_TSC" ]
  then
    FP_TSC=tsgo
  fi
  #echo $PWD
  #which $FP_TSC
  shift
  #echo $(which $FP_TSC) $@
  exec $(which $FP_TSC) $@
fi

exec pnpm exec tsx $(dirname $0)/main.ts $@
