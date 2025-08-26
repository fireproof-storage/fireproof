#!/bin/bash

echo "🧪 Running JWKS Validator Test Suite"
echo "===================================="

echo "📋 1. Basic unit tests..."
npx vitest run tests/basic.test.ts --reporter=verbose

echo -e "\n🌐 2. Integration tests (with live Clerk endpoint)..."
npx vitest run tests/integration.test.ts --reporter=verbose

echo -e "\n📊 3. All tests..."
npx vitest run tests/ --reporter=verbose

echo -e "\n✅ Test suite completed!"
