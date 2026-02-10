#!/bin/bash
set -e

DEFAULT_KEY="pk_test_c2luY2VyZS1jaGVldGFoLTMwLmNsZXJrLmFjY291bnRzLmRldiQ"
STATIC_DIR="${STATIC_DIR:-/app/dashboard/frontend/dist/static/client}"

if [ -n "$VITE_CLERK_PUBLISHABLE_KEY" ] && [ "$VITE_CLERK_PUBLISHABLE_KEY" != "$DEFAULT_KEY" ]; then
  echo "Replacing Clerk publishable key in static assets..."
  find "$STATIC_DIR" -name '*.js' -exec sed -i "s|${DEFAULT_KEY}|${VITE_CLERK_PUBLISHABLE_KEY}|g" {} +
  echo "Clerk publishable key replaced."
fi

cd /app/dashboard/backend
DASH_FP_TEST_SQL_URL="file://${DB_PATH}" \
  pnpm exec drizzle-kit push --config ./drizzle.libsql.config.ts

cd /app
exec tsx dashboard/backend/node-serve.ts
