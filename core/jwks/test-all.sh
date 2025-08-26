#!/bin/bash

printf "🧪 Running JWKS Validator Test Suite"
printf "===================================="

printf "📋 1. Basic unit tests..."
npx vitest run tests/basic.test.ts --reporter=verbose

printf "\n🌐 2. Integration tests (with live Clerk endpoint)..."
npx vitest run tests/integration.test.ts --reporter=verbose

printf "\n📊 3. All tests..."
npx vitest run tests/ --reporter=verbose

printf "\n✅ Test suite completed!"
