#!/bin/bash
set -e

CONTAINER_NAME=fireproof-test-minio

# Exit if we're running in CI with Minio
if [ "$FP_CI" = "fp_ci" ] && [ -n "$CI_MINIO_ENDPOINT" ]; then
  echo "Using CI Minio, not stopping"
  exit 0
fi

# Check if container is running
if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
  echo "Stopping Minio container..."
  docker stop $CONTAINER_NAME
else
  echo "No Minio container running"
fi
