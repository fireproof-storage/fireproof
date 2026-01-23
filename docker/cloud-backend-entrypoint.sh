#!/bin/bash
set -e

cd /app/cloud/backend/cf-d1

# Initialize D1 database schema (only creates tables if they don't exist)
echo "Initializing D1 database schema..."
npx wrangler d1 execute fp-meta-local --local --file=schema.sql --persist-to=/app/.wrangler/state 2>/dev/null || true

# Build wrangler vars from environment variables
WRANGLER_VARS=""
if [ -n "$CLOUD_SESSION_TOKEN_PUBLIC" ]; then
  WRANGLER_VARS="$WRANGLER_VARS --var CLOUD_SESSION_TOKEN_PUBLIC:$CLOUD_SESSION_TOKEN_PUBLIC"
fi
if [ -n "$CLOUD_SESSION_TOKEN_SECRET" ]; then
  WRANGLER_VARS="$WRANGLER_VARS --var CLOUD_SESSION_TOKEN_SECRET:$CLOUD_SESSION_TOKEN_SECRET"
fi
if [ -n "$VERSION" ]; then
  WRANGLER_VARS="$WRANGLER_VARS --var VERSION:$VERSION"
fi
if [ -n "$FP_DEBUG" ]; then
  WRANGLER_VARS="$WRANGLER_VARS --var FP_DEBUG:$FP_DEBUG"
fi
if [ -n "$BLOB_PROXY_URL" ]; then
  WRANGLER_VARS="$WRANGLER_VARS --var BLOB_PROXY_URL:$BLOB_PROXY_URL"
fi

# Start wrangler dev with environment variables
echo "Starting wrangler dev..."
echo "Passing vars: $WRANGLER_VARS"
exec npx wrangler dev --local --persist-to /app/.wrangler/state --port 8909 --ip 0.0.0.0 $WRANGLER_VARS
