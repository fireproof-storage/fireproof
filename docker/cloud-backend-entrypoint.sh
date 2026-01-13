#!/bin/bash
set -e

cd /app/cloud/backend/cf-d1

# Initialize D1 database schema (only creates tables if they don't exist)
echo "Initializing D1 database schema..."
npx wrangler d1 execute fp-meta-local --local --file=schema.sql --persist-to=/app/.wrangler/state 2>/dev/null || true

# Start wrangler dev
echo "Starting wrangler dev..."
exec npx wrangler dev --local --persist-to /app/.wrangler/state --port 8909 --ip 0.0.0.0
