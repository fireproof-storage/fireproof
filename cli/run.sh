#!/bin/bash
#echo "run.sh $0,$1,$FP_TSC $PATH"
if [ "$1" = "tsc" ]
then
  if [ -z "$FP_TSC" ]
  then
    FP_TSC=tsgo
  fi
  echo "Using typescript: $FP_TSC"
  #echo $PWD
  #which $FP_TSC
  shift
  #echo $(which $FP_TSC) $@
  exec $(which $FP_TSC) $@
fi
dirName=$(dirname $0)
if [ -f $dirName/main.js ]
then
   exec node $dirName/main.js $@
else
   exec pnpm exec tsx $dirName/main.ts $@
fi
