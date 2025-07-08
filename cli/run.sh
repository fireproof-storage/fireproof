#!/bin/bash
exec pnpm exec tsx $(dirname $0)/main.ts $@
